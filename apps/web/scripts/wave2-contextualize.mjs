#!/usr/bin/env node
/**
 * Wave 2 — Contextual Retrieval backfill.
 *
 * For every canonical_document_chunks row it:
 *   1. builds a SHORT context blurb — a deterministic identifier line
 *      (aircraft / document / section / page, from the DB) plus a 1-2 sentence
 *      LLM summary (gpt-4o-mini) that situates the chunk, plus any AD/SB/part/
 *      date/tach identifiers the LLM spots,
 *   2. writes it to canonical_document_chunks.context_text,
 *   3. re-embeds (context_text || chunk_text) with text-embedding-3-large and
 *      upserts canonical_document_embeddings.
 *
 * chunk_text is NEVER modified — it stays the verbatim cited source.
 *
 * RESUMABLE + IDEMPOTENT: it only processes chunks where context_text IS NULL,
 * and writes per document (embedding first, context_text last) so a chunk that
 * has context_text set is guaranteed to also have its contextual embedding.
 * Safe to re-run after an interruption.
 *
 * USAGE
 *   cd apps/web
 *   node scripts/wave2-contextualize.mjs
 *
 * OPTIONS (env)
 *   WAVE2_LIMIT        Max chunks to process this run (0 = all; use for smoke)
 *   WAVE2_CONCURRENCY  Parallel context-gen requests (default 24)
 *   WAVE2_CTX_MODEL    Context-gen model (default gpt-4o-mini)
 *   WAVE2_EMBED_MODEL  Embedding model (default text-embedding-3-large)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const HERE = dirname(fileURLToPath(import.meta.url))

// ─── env ──────────────────────────────────────────────────────────────────
function loadEnvLocal() {
  const env = {}
  try {
    for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch (e) {
    console.error(`[wave2] could not read .env.local: ${e.message}`)
  }
  return env
}
const fileEnv = loadEnvLocal()
const getEnv = (k) => process.env[k] || fileEnv[k] || ''

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const OPENAI_KEY = getEnv('OPENAI_API_KEY')
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('[wave2] missing credentials in apps/web/.env.local')
  process.exit(1)
}

const LIMIT = Math.max(0, Number(process.env.WAVE2_LIMIT) || 0)
const CONCURRENCY = Math.max(1, Number(process.env.WAVE2_CONCURRENCY) || 24)
const CTX_MODEL = process.env.WAVE2_CTX_MODEL || 'gpt-4o-mini'
const EMBED_MODEL = process.env.WAVE2_EMBED_MODEL || 'text-embedding-3-large'
const WINDOW_EACH_SIDE = 5
const WINDOW_CHAR_CAP = 2000
const EMBED_BATCH = 100
const PRICE = { ctx_in: 0.15, ctx_out: 0.6, embed: 0.13 } // USD / 1M tokens

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const openai = new OpenAI({ apiKey: OPENAI_KEY })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Source-of-truth: DIRECT_CHUNKING_SOURCE_TAG in apps/web/lib/ocr/direct-chunking.ts.
// Direct-chunking canonical chunks already carry family-aware semantic context
// (per-entry chunk_kind + family_metadata) so the LLM blurb is redundant.
// Hard-coded here because this is a .mjs standalone script that can't import
// from a .ts module; the constant on the TS side is the source of truth.
const DIRECT_CHUNKING_SOURCE_TAG = 'direct_chunking'

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.status ?? 0
      if ((status !== 429 && status < 500) || attempt === 6) throw err
      const delay = Math.min(2000 * 2 ** (attempt - 1), 60000)
      console.warn(`[wave2] ${label} retry ${attempt}/6 in ${delay / 1000}s (status ${status})`)
      await sleep(delay)
    }
  }
}

async function runPool(items, concurrency, worker) {
  let idx = 0
  const out = new Array(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      out[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return out
}

// ─── load chunks needing contextualization ──────────────────────────────────
async function loadPendingChunks() {
  const chunks = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('canonical_document_chunks')
      // metadata_json drives the direct-chunking short-circuit in generateContext.
      .select('id, document_id, organization_id, aircraft_id, page_number, chunk_index, section_title, chunk_text, metadata_json')
      .is('context_text', null)
      .order('document_id', { ascending: true })
      .order('chunk_index', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`load chunks: ${error.message}`)
    if (!data || data.length === 0) break
    chunks.push(...data)
    if (data.length < PAGE) break
    if (LIMIT && chunks.length >= LIMIT) break
  }
  return LIMIT ? chunks.slice(0, LIMIT) : chunks
}

// ─── document + aircraft metadata (for the deterministic context line) ──────
async function loadMetadata(docIds, aircraftIds) {
  const docMap = new Map()
  const acMap = new Map()
  for (let i = 0; i < docIds.length; i += 200) {
    const { data } = await supabase
      .from('documents')
      .select('id, title, doc_type')
      .in('id', docIds.slice(i, i + 200))
    for (const d of data || []) docMap.set(d.id, d)
  }
  const validAc = aircraftIds.filter(Boolean)
  for (let i = 0; i < validAc.length; i += 200) {
    const { data } = await supabase
      .from('aircraft')
      .select('id, tail_number, make, model')
      .in('id', validAc.slice(i, i + 200))
    for (const a of data || []) acMap.set(a.id, a)
  }
  return { docMap, acMap }
}

// ─── context generation ─────────────────────────────────────────────────────
function deterministicLine(chunk, doc, ac) {
  const parts = []
  if (ac?.tail_number) parts.push(ac.tail_number)
  if (ac?.make || ac?.model) parts.push([ac?.make, ac?.model].filter(Boolean).join(' '))
  if (doc?.doc_type) parts.push(doc.doc_type)
  if (doc?.title) parts.push(doc.title)
  if (chunk.section_title) parts.push(chunk.section_title)
  if (chunk.page_number != null) parts.push(`p${chunk.page_number}`)
  return parts.join(' · ')
}

function buildWindow(group, idx) {
  const start = Math.max(0, idx - WINDOW_EACH_SIDE)
  const end = Math.min(group.length, idx + WINDOW_EACH_SIDE + 1)
  let text = ''
  for (let i = start; i < end; i++) {
    if (i === idx) continue
    const t = (group[i].chunk_text || '').trim()
    if (!t) continue
    text += t + '\n---\n'
    if (text.length >= WINDOW_CHAR_CAP) break
  }
  return text.slice(0, WINDOW_CHAR_CAP)
}

function isDirectChunkingChunk(chunk) {
  return chunk?.metadata_json?.source === DIRECT_CHUNKING_SOURCE_TAG
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDateMulti(iso) {
  if (typeof iso !== 'string') return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${MONTH_NAMES[month - 1]} ${day}, ${m[1]} (${iso})`
}

function extractStructuredIdentifiers(chunk) {
  const fm = chunk?.metadata_json?.family_metadata
  if (!fm || typeof fm !== 'object') return ''
  const parts = []
  const dateFields = [
    ['entry_date_iso', 'Date'],
    ['open_date_iso', 'Open date'],
    ['close_date_iso', 'Close date'],
    ['effective_date_iso', 'Effective date'],
    ['compliance_date_iso', 'Compliance date'],
    ['inspection_date_iso', 'Inspection date'],
  ]
  for (const [field, label] of dateFields) {
    const v = fm[field]
    if (typeof v === 'string') {
      const f = formatDateMulti(v)
      if (f) parts.push(`${label}: ${f}`)
    }
  }
  const mech = []
  if (typeof fm.mechanic_name === 'string' && fm.mechanic_name.length > 0) mech.push(fm.mechanic_name)
  if (typeof fm.mechanic_cert === 'string' && fm.mechanic_cert.length > 0) mech.push(`A&P ${fm.mechanic_cert}`)
  if (typeof fm.ia_number === 'string' && fm.ia_number.length > 0) mech.push(`IA ${fm.ia_number}`)
  if (mech.length > 0) parts.push(`Mechanic: ${mech.join(' ')}`)
  for (const [field, label] of [['tach_time_text', 'Tach'], ['airframe_tt_text', 'Airframe TT'], ['tsmoh_text', 'TSMOH']]) {
    const v = fm[field]
    if (typeof v === 'string' && v.length > 0) parts.push(`${label}: ${v}`)
  }
  if (Array.isArray(fm.ad_references) && fm.ad_references.length > 0) parts.push(`AD: ${fm.ad_references.join(', ')}`)
  if (Array.isArray(fm.part_numbers) && fm.part_numbers.length > 0) parts.push(`Parts: ${fm.part_numbers.join(', ')}`)
  if (typeof fm.work_order_number === 'string' && fm.work_order_number.length > 0) parts.push(`WO: ${fm.work_order_number}`)
  if (typeof fm.ad_number === 'string' && fm.ad_number.length > 0) parts.push(`AD #: ${fm.ad_number}`)
  if (typeof fm.sb_number === 'string' && fm.sb_number.length > 0) parts.push(`SB #: ${fm.sb_number}`)
  if (typeof fm.subject === 'string' && fm.subject.length > 0) parts.push(`Subject: ${fm.subject}`)
  if (typeof fm.inspection_type === 'string' && fm.inspection_type.length > 0) parts.push(`Inspection: ${fm.inspection_type}`)
  if (typeof fm.tail_number === 'string' && fm.tail_number.length > 0) parts.push(`Tail: ${fm.tail_number}`)
  return parts.join('; ')
}

async function generateContext(group, idx, doc, ac, tally) {
  const chunk = group[idx]
  const detLine = deterministicLine(chunk, doc, ac)
  // Note: previously short-circuited for direct-chunking chunks. That assumption
  // broke for short signoff/header chunks where the chunk text alone is
  // "I certify... [name] A&P [number]" — no date / aircraft context in the
  // text the embedding model sees, even though family_metadata has both. Now
  // family_metadata fields are explicitly fed to the prompt as <extracted_fields>
  // AND deterministically appended to context_text. Source of truth lives in
  // apps/web/lib/rag/contextual.ts; this .mjs mirrors it for the standalone
  // backfill path. ~$0.005/chunk on gpt-4o-mini.
  const window = buildWindow(group, idx)
  const messages = [
    {
      role: 'system',
      content:
        'You situate an excerpt within its aircraft-maintenance document so it ' +
        'can be retrieved on its own (logbooks, manuals, ADs, SBs, work orders). ' +
        'When <extracted_fields> are present, weave the date and mechanic/signer ' +
        'into your context sentence using natural English ("Month Day, Year") so ' +
        'date-anchored queries match. ' +
        'Reply with strict JSON: {"context": "<1-2 plain sentences situating ' +
        'this chunk — include any extracted date and mechanic name>", ' +
        '"identifiers": "<comma-separated AD/SB/STC numbers, part numbers, ' +
        'serial numbers, dates, tach/Hobbs times from the chunk or ' +
        '<extracted_fields>; empty string if none>"}. Never invent facts.',
    },
    {
      role: 'user',
      content:
        `<document>${detLine}</document>\n\n` +
        `<surrounding_excerpts>\n${window || '(none)'}\n</surrounding_excerpts>\n\n` +
        `<extracted_fields>\n${structuredIdents || '(none)'}\n</extracted_fields>\n\n` +
        `<chunk>\n${(chunk.chunk_text || '').slice(0, 4000)}\n</chunk>`,
    },
  ]
  let summary = ''
  let identifiers = ''
  try {
    const resp = await withRetry(
      () =>
        openai.chat.completions.create({
          model: CTX_MODEL,
          temperature: 0,
          max_tokens: 240,
          response_format: { type: 'json_object' },
          messages,
        }),
      'context-gen',
    )
    const u = resp.usage || {}
    tally.ctxIn += u.prompt_tokens || 0
    tally.ctxOut += u.completion_tokens || 0
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}')
    summary = typeof parsed.context === 'string' ? parsed.context.trim() : ''
    identifiers = typeof parsed.identifiers === 'string' ? parsed.identifiers.trim() : ''
  } catch (err) {
    tally.ctxFail++
    // Best-effort: deterministic line alone is still better than nothing.
  }
  let ctx = detLine
  if (summary) ctx += `\n${summary}`
  if (identifiers) ctx += `\nKey references: ${identifiers}`
  // Belt-and-suspenders: always append structured identifiers so high-signal
  // fields land in the embedding text even if the LLM omitted them.
  if (structuredIdents) ctx += `\nFields: ${structuredIdents}`
  return ctx
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[wave2] contextualize backfill — concurrency=${CONCURRENCY} model=${CTX_MODEL}` + (LIMIT ? ` LIMIT=${LIMIT}` : ''))
  const t0 = Date.now()

  const chunks = await loadPendingChunks()
  if (chunks.length === 0) {
    console.log('[wave2] nothing to do — every canonical chunk already has context_text.')
    return
  }
  console.log(`[wave2] ${chunks.length} chunk(s) pending contextualization`)

  const { docMap, acMap } = await loadMetadata(
    [...new Set(chunks.map((c) => c.document_id))],
    [...new Set(chunks.map((c) => c.aircraft_id))],
  )

  // Group by document, preserve chunk_index order, for the sibling windows.
  const groups = new Map()
  for (const c of chunks) {
    if (!groups.has(c.document_id)) groups.set(c.document_id, [])
    groups.get(c.document_id).push(c)
  }
  for (const g of groups.values()) g.sort((a, b) => a.chunk_index - b.chunk_index)

  const tally = { ctxIn: 0, ctxOut: 0, embedTok: 0, ctxFail: 0, done: 0, embedFail: 0 }
  let docNo = 0

  for (const [docId, group] of groups) {
    docNo++
    const doc = docMap.get(docId)
    const ac = group[0].aircraft_id ? acMap.get(group[0].aircraft_id) : null

    // 1. context generation for every chunk in the doc.
    const contexts = await runPool(group.map((_, i) => i), CONCURRENCY, (i) =>
      generateContext(group, i, doc, ac, tally),
    )

    // 2. re-embed (context_text || chunk_text) in batches, upsert embeddings,
    //    then write context_text LAST so context_text != null ⇒ embedding done.
    for (let i = 0; i < group.length; i += EMBED_BATCH) {
      const sliceIdx = []
      for (let j = i; j < Math.min(i + EMBED_BATCH, group.length); j++) sliceIdx.push(j)
      const inputs = sliceIdx.map((j) => `${contexts[j]}\n\n${group[j].chunk_text || ''}`)
      let vectors
      try {
        const resp = await withRetry(
          () => openai.embeddings.create({ model: EMBED_MODEL, input: inputs, dimensions: 1536 }),
          'embed',
        )
        tally.embedTok += resp.usage?.total_tokens || 0
        vectors = resp.data.map((d) => d.embedding)
      } catch (err) {
        tally.embedFail += sliceIdx.length
        console.warn(`[wave2] embed batch failed (doc ${docId}): ${err?.message || err}`)
        continue // leave these chunks' context_text NULL → re-run will retry
      }

      const embedRows = sliceIdx.map((j, k) => ({
        chunk_id: group[j].id,
        document_id: group[j].document_id,
        organization_id: group[j].organization_id,
        aircraft_id: group[j].aircraft_id,
        embedding_model: EMBED_MODEL,
        embedding: vectors[k],
      }))
      const { error: embErr } = await supabase
        .from('canonical_document_embeddings')
        .upsert(embedRows, { onConflict: 'chunk_id' })
      if (embErr) {
        tally.embedFail += sliceIdx.length
        console.warn(`[wave2] embedding upsert failed (doc ${docId}): ${embErr.message}`)
        continue
      }

      // context_text written AFTER the embedding — concurrent small updates.
      await runPool(sliceIdx, 12, async (j) => {
        const { error } = await supabase
          .from('canonical_document_chunks')
          .update({ context_text: contexts[j] })
          .eq('id', group[j].id)
        if (error) console.warn(`[wave2] context_text update failed (${group[j].id}): ${error.message}`)
        else tally.done++
      })
    }

    if (docNo % 20 === 0 || docNo === groups.size) {
      const rate = tally.done / ((Date.now() - t0) / 1000)
      console.log(
        `[wave2]   doc ${docNo}/${groups.size}  chunks done ${tally.done}/${chunks.length}  ` +
          `(${rate.toFixed(1)}/s, ${tally.ctxFail} ctx-fallbacks, ${tally.embedFail} embed-fails)`,
      )
    }
  }

  const elapsed = (Date.now() - t0) / 1000
  const cost =
    (tally.ctxIn / 1e6) * PRICE.ctx_in +
    (tally.ctxOut / 1e6) * PRICE.ctx_out +
    (tally.embedTok / 1e6) * PRICE.embed
  console.log('\n══════════ WAVE 2 CONTEXTUALIZE — DONE ══════════')
  console.log(`Chunks contextualized: ${tally.done}/${chunks.length}`)
  console.log(`Context fallbacks (LLM failed, deterministic-only): ${tally.ctxFail}`)
  console.log(`Embed failures (left for re-run): ${tally.embedFail}`)
  console.log(`Tokens: ctx ${tally.ctxIn} in / ${tally.ctxOut} out · embed ${tally.embedTok}`)
  console.log(`Cost: $${cost.toFixed(2)}   Wall-clock: ${(elapsed / 60).toFixed(1)} min`)
  console.log('═══════════════════════════════════════════════════')
  if (tally.embedFail > 0) {
    console.log('Some chunks were left for a re-run — run the script again to finish them.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[wave2] FATAL:', err?.stack || err?.message || err)
  process.exit(1)
})
