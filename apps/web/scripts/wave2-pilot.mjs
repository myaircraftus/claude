#!/usr/bin/env node
/**
 * Wave 2 PILOT — contextual-retrieval cost + throughput measurement.
 *
 * Wave 2 of the RAG-hardening program is "contextual retrieval" (Anthropic's
 * technique): for every chunk, an LLM writes a 1-2 sentence blurb situating
 * that chunk inside its document, the blurb is prepended, and the chunk is
 * re-embedded. Across the whole corpus that is ~247K chunks — a real spend of
 * money and hours. This script measures the REAL cost and throughput on a
 * representative SAMPLE so the full-run estimate is a number, not a guess.
 *
 * WHAT IT DOES
 *   1. Picks a random sample of documents from the org until ~PILOT_CHUNKS
 *      chunks are covered (whole documents, so the context window is real).
 *   2. For each chunk, builds a windowed context-generation prompt (document
 *      title/type/section + a few sibling chunks + the chunk itself) and calls
 *      gpt-4o-mini to produce the contextual blurb.
 *   3. Re-embeds the contextualized text with text-embedding-3-large.
 *   4. Reports measured token usage, wall-clock, $ cost, and an extrapolation
 *      to the full 247,426-chunk corpus.
 *
 * IT IS READ-ONLY against the database — it never writes chunks, embeddings,
 * or context blurbs back. It only spends OpenAI API tokens (~$1-2). The
 * generated blurbs + metrics are written to a local JSON file.
 *
 * USAGE
 *   cd apps/web
 *   node scripts/wave2-pilot.mjs
 *
 * Credentials are read from apps/web/.env.local (OPENAI_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 *
 * OPTIONS (env)
 *   PILOT_CHUNKS        Target sample size in chunks (default 2500)
 *   PILOT_CONCURRENCY   Parallel context-gen requests (default 8)
 *   PILOT_ORG_ID        Org to sample (default = the 247K-chunk Horizon org)
 *   PILOT_CTX_MODEL     Context-gen model (default gpt-4o-mini)
 *   PILOT_EMBED_MODEL   Embedding model (default text-embedding-3-large)
 *   PILOT_OUT           Results JSON path (default wave2-pilot-results.json)
 *   PILOT_SKIP_EMBED    Set to 1 to skip the re-embed measurement pass
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const HERE = dirname(fileURLToPath(import.meta.url))

// ─── env ──────────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const path = resolve(HERE, '..', '.env.local')
  const env = {}
  try {
    const raw = readFileSync(path, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch (e) {
    console.error(`[wave2-pilot] could not read .env.local at ${path}: ${e.message}`)
  }
  return env
}
const fileEnv = loadEnvLocal()
const getEnv = (k) => process.env[k] || fileEnv[k] || ''

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const OPENAI_KEY = getEnv('OPENAI_API_KEY')
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error(
    '[wave2-pilot] missing credentials — need NEXT_PUBLIC_SUPABASE_URL, ' +
      'SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in apps/web/.env.local',
  )
  process.exit(1)
}

// ─── config ───────────────────────────────────────────────────────────────
const SAMPLE_CHUNKS = Math.max(100, Number(process.env.PILOT_CHUNKS) || 2500)
const CONCURRENCY = Math.max(1, Number(process.env.PILOT_CONCURRENCY) || 8)
const CTX_MODEL = process.env.PILOT_CTX_MODEL || 'gpt-4o-mini'
const EMBED_MODEL = process.env.PILOT_EMBED_MODEL || 'text-embedding-3-large'
const ORG_ID = process.env.PILOT_ORG_ID || '82042eee-1d20-49a4-be12-12f73e335392'
const OUT = process.env.PILOT_OUT || 'wave2-pilot-results.json'
const SKIP_EMBED = process.env.PILOT_SKIP_EMBED === '1'
const CORPUS_TOTAL = 247426 // document_chunks rowcount, all orgs (measured 2026-05-18)

// Prices in USD per 1,000,000 tokens. Update if OpenAI changes pricing.
const PRICE = {
  ctx_input: 0.15, // gpt-4o-mini uncached input
  ctx_cached: 0.075, // gpt-4o-mini cached input
  ctx_output: 0.6, // gpt-4o-mini output
  embed: 0.13, // text-embedding-3-large
}

// Context window: how many sibling chunks each side, capped by characters.
const WINDOW_EACH_SIDE = 5
const WINDOW_CHAR_CAP = 2000

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
})
const openai = new OpenAI({ apiKey: OPENAI_KEY })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── sample selection ───────────────────────────────────────────────────────
async function selectSample() {
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title, doc_type')
    .eq('organization_id', ORG_ID)
  if (error) throw new Error(`documents query failed: ${error.message}`)
  if (!docs || docs.length === 0) throw new Error('no documents found for org')

  // Shuffle (Fisher-Yates) so the sample spans the document-size distribution.
  for (let i = docs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[docs[i], docs[j]] = [docs[j], docs[i]]
  }

  const groups = []
  let total = 0
  for (const doc of docs) {
    if (total >= SAMPLE_CHUNKS) break
    const { data: chunks, error: cErr } = await supabase
      .from('document_chunks')
      .select('id, chunk_index, section_title, chunk_text, page_number')
      .eq('document_id', doc.id)
      .order('chunk_index', { ascending: true })
    if (cErr) throw new Error(`chunks query failed for ${doc.id}: ${cErr.message}`)
    if (!chunks || chunks.length === 0) continue
    groups.push({ doc, chunks })
    total += chunks.length
  }
  return { groups, total }
}

// ─── context-generation prompt ──────────────────────────────────────────────
function buildWindow(chunks, idx) {
  const start = Math.max(0, idx - WINDOW_EACH_SIDE)
  const end = Math.min(chunks.length, idx + WINDOW_EACH_SIDE + 1)
  let text = ''
  for (let i = start; i < end; i++) {
    if (i === idx) continue
    const t = (chunks[i].chunk_text || '').trim()
    if (!t) continue
    text += t + '\n---\n'
    if (text.length >= WINDOW_CHAR_CAP) break
  }
  return text.slice(0, WINDOW_CHAR_CAP)
}

function buildMessages(doc, chunks, idx) {
  const chunk = chunks[idx]
  const window = buildWindow(chunks, idx)
  const system =
    'You situate an excerpt within its source document so it can be ' +
    'retrieved on its own. This is aircraft maintenance documentation ' +
    '(logbooks, manuals, ADs, SBs, work orders). Reply with ONLY a ' +
    'succinct 1-2 sentence context — no preamble, no quotes.'
  const user =
    `<document>\n` +
    `Title: ${doc.title || 'Untitled'}\n` +
    `Type: ${doc.doc_type || 'unknown'}\n` +
    `Section: ${chunk.section_title || 'n/a'}\n` +
    `Page: ${chunk.page_number ?? 'n/a'}\n` +
    `</document>\n\n` +
    `<surrounding_excerpts>\n${window || '(none)'}\n</surrounding_excerpts>\n\n` +
    `<chunk>\n${(chunk.chunk_text || '').slice(0, 4000)}\n</chunk>\n\n` +
    `Give the short context that situates this chunk within the document, ` +
    `to improve search retrieval. Answer with only the context.`
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

// ─── OpenAI call with light retry ───────────────────────────────────────────
async function withRetry(fn, label) {
  const MAX = 6
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.status ?? 0
      const transient = status === 429 || status >= 500
      if (!transient || attempt === MAX) throw err
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 60000) + Math.random() * 500
      console.warn(
        `[wave2-pilot] ${label} transient error (status=${status}) — ` +
          `retry ${attempt}/${MAX} in ${Math.round(delay / 1000)}s`,
      )
      await sleep(delay)
    }
  }
  throw new Error('unreachable')
}

// ─── concurrency pool ───────────────────────────────────────────────────────
async function runPool(items, concurrency, worker, onProgress) {
  let idx = 0
  let done = 0
  const results = new Array(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await worker(items[i], i)
      done++
      if (onProgress && done % 200 === 0) onProgress(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return results
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('[wave2-pilot] Wave 2 contextual-retrieval pilot')
  console.log(
    `[wave2-pilot] org=${ORG_ID} target=${SAMPLE_CHUNKS} chunks ` +
      `concurrency=${CONCURRENCY} ctx-model=${CTX_MODEL}`,
  )

  const { groups, total } = await selectSample()
  console.log(
    `[wave2-pilot] sample: ${groups.length} documents, ${total} chunks`,
  )

  // Flatten into per-chunk tasks; each task keeps a back-pointer to its group.
  const tasks = []
  for (const g of groups) {
    for (let i = 0; i < g.chunks.length; i++) {
      tasks.push({ group: g, idx: i })
    }
  }

  // ── Pass 1: context generation ──────────────────────────────────────────
  let ctxInputTokens = 0
  let ctxCachedTokens = 0
  let ctxOutputTokens = 0
  let ctxFailures = 0
  const contexts = new Array(tasks.length)

  const t0 = Date.now()
  await runPool(
    tasks,
    CONCURRENCY,
    async (task, i) => {
      const { group, idx } = task
      const messages = buildMessages(group.doc, group.chunks, idx)
      try {
        const resp = await withRetry(
          () =>
            openai.chat.completions.create({
              model: CTX_MODEL,
              temperature: 0,
              max_tokens: 130,
              messages,
            }),
          'context-gen',
        )
        const u = resp.usage || {}
        const cached = u.prompt_tokens_details?.cached_tokens || 0
        ctxInputTokens += (u.prompt_tokens || 0) - cached
        ctxCachedTokens += cached
        ctxOutputTokens += u.completion_tokens || 0
        contexts[i] = {
          chunk_id: group.chunks[idx].id,
          context: (resp.choices?.[0]?.message?.content || '').trim(),
        }
      } catch (err) {
        ctxFailures++
        contexts[i] = { chunk_id: group.chunks[idx].id, context: '', error: String(err?.message || err) }
      }
    },
    (done, all) => {
      const rate = done / ((Date.now() - t0) / 1000)
      console.log(`[wave2-pilot]   context-gen ${done}/${all} (${rate.toFixed(1)}/s)`)
    },
  )
  const ctxElapsedMs = Date.now() - t0
  console.log(
    `[wave2-pilot] context-gen done in ${(ctxElapsedMs / 1000).toFixed(1)}s ` +
      `(${ctxFailures} failures)`,
  )

  // ── Pass 2: re-embed the contextualized text ────────────────────────────
  let embedTokens = 0
  let embedElapsedMs = 0
  if (!SKIP_EMBED) {
    const inputs = tasks.map((task, i) => {
      const chunk = task.group.chunks[task.idx]
      const ctx = contexts[i]?.context || ''
      return ctx ? `${ctx}\n\n${chunk.chunk_text || ''}` : chunk.chunk_text || ''
    })
    const e0 = Date.now()
    const BATCH = 100
    for (let i = 0; i < inputs.length; i += BATCH) {
      const batch = inputs.slice(i, i + BATCH)
      const resp = await withRetry(
        () => openai.embeddings.create({ model: EMBED_MODEL, input: batch, dimensions: 1536 }),
        'embed',
      )
      embedTokens += resp.usage?.total_tokens || resp.usage?.prompt_tokens || 0
      if (i + BATCH < inputs.length) await sleep(150)
    }
    embedElapsedMs = Date.now() - e0
    console.log(
      `[wave2-pilot] re-embed done in ${(embedElapsedMs / 1000).toFixed(1)}s`,
    )
  }

  // ── Cost ────────────────────────────────────────────────────────────────
  const ctxCost =
    (ctxInputTokens / 1e6) * PRICE.ctx_input +
    (ctxCachedTokens / 1e6) * PRICE.ctx_cached +
    (ctxOutputTokens / 1e6) * PRICE.ctx_output
  const embedCost = (embedTokens / 1e6) * PRICE.embed
  const sampleCost = ctxCost + embedCost
  const n = tasks.length
  const scale = CORPUS_TOTAL / n

  const totalMs = ctxElapsedMs + embedElapsedMs
  const chunksPerSec = n / (totalMs / 1000)
  const fullRunSeconds = CORPUS_TOTAL / chunksPerSec

  const fmt = (d) => `$${d.toFixed(2)}`
  const dur = (s) => {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const report = {
    generated_at: new Date().toISOString(),
    config: { ORG_ID, SAMPLE_CHUNKS, CONCURRENCY, CTX_MODEL, EMBED_MODEL },
    sample: {
      documents: groups.length,
      chunks: n,
      context_failures: ctxFailures,
    },
    tokens: {
      ctx_input: ctxInputTokens,
      ctx_cached: ctxCachedTokens,
      ctx_output: ctxOutputTokens,
      ctx_input_per_chunk: Math.round((ctxInputTokens + ctxCachedTokens) / n),
      ctx_output_per_chunk: Math.round(ctxOutputTokens / n),
      embed_total: embedTokens,
    },
    timing: {
      context_gen_seconds: +(ctxElapsedMs / 1000).toFixed(1),
      embed_seconds: +(embedElapsedMs / 1000).toFixed(1),
      chunks_per_second: +chunksPerSec.toFixed(2),
    },
    cost_sample: {
      context_gen: +ctxCost.toFixed(4),
      re_embed: +embedCost.toFixed(4),
      total: +sampleCost.toFixed(4),
    },
    extrapolation_full_corpus: {
      corpus_chunks: CORPUS_TOTAL,
      context_gen_cost: +(ctxCost * scale).toFixed(2),
      re_embed_cost: +(embedCost * scale).toFixed(2),
      total_cost: +(sampleCost * scale).toFixed(2),
      wall_clock_seconds: Math.round(fullRunSeconds),
      wall_clock_human: dur(fullRunSeconds),
      note:
        'Wall-clock assumes the same concurrency and the OpenAI account ' +
        'tier sustains it. Structured extraction is a separate comparable ' +
        'LLM pass — budget roughly the context-gen figure again for it.',
    },
    contexts_sample: contexts.slice(0, 25),
  }

  writeFileSync(resolve(process.cwd(), OUT), JSON.stringify(report, null, 2))

  // ── Print summary ───────────────────────────────────────────────────────
  console.log('\n══════════ WAVE 2 PILOT — MEASURED RESULTS ══════════')
  console.log(`Sample:            ${groups.length} docs, ${n} chunks`)
  console.log(
    `Context-gen:       ${(ctxElapsedMs / 1000).toFixed(0)}s  ` +
      `(${chunksPerSec.toFixed(1)} chunks/s, ${ctxFailures} failures)`,
  )
  console.log(
    `Input tokens:      ${ctxInputTokens.toLocaleString()} uncached + ` +
      `${ctxCachedTokens.toLocaleString()} cached  ` +
      `(~${Math.round((ctxInputTokens + ctxCachedTokens) / n)}/chunk)`,
  )
  console.log(
    `Output tokens:     ${ctxOutputTokens.toLocaleString()}  ` +
      `(~${Math.round(ctxOutputTokens / n)}/chunk)`,
  )
  if (!SKIP_EMBED) {
    console.log(`Embed tokens:      ${embedTokens.toLocaleString()}`)
  }
  console.log('─────────────────────────────────────────────────────')
  console.log(`Sample cost:       ${fmt(sampleCost)}  ` +
    `(context ${fmt(ctxCost)} + embed ${fmt(embedCost)})`)
  console.log('─────────── EXTRAPOLATION TO 247,426 CHUNKS ───────────')
  console.log(`Context-gen pass:  ${fmt(ctxCost * scale)}`)
  console.log(`Re-embed pass:     ${fmt(embedCost * scale)}`)
  console.log(`WAVE 2 total $:    ${fmt(sampleCost * scale)}  (+ a comparable`)
  console.log(`                   pass again if structured extraction is in)`)
  console.log(`Wall-clock:        ${dur(fullRunSeconds)} at concurrency ${CONCURRENCY}`)
  console.log('═══════════════════════════════════════════════════════')
  console.log(`\nFull report + sample blurbs written to ${OUT}`)
}

main().catch((err) => {
  console.error('[wave2-pilot] FATAL:', err?.stack || err?.message || err)
  process.exit(1)
})
