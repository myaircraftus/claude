#!/usr/bin/env node
/**
 * Wave 2 — RETRIEVAL-RECALL baseline eval.
 *
 * Wave 2 (Contextual Retrieval) is designed to improve one thing: retrieval
 * RECALL — whether the chunk that actually answers a question is found. This
 * harness measures exactly that, so the before/after improvement is provable.
 *
 * For each case in wave2-eval-cases.json it:
 *   1. embeds the question with text-embedding-3-large (the app's model),
 *   2. calls the LIVE search_canonical_documents RPC (the app's retrieval
 *      primitive) for the top-20 results — TWICE: once org-wide (the "All
 *      Aircraft" path) and once aircraft-scoped (the path used when an
 *      aircraft is selected, resolved from the tail number in the question),
 *   3. records the rank at which the verified gold (document, page) appears.
 *
 * It reports recall@5/@10/@20 and MRR for both scopes, page-level and
 * document-level. Run it now for the BASELINE, run it again after the Wave 2
 * re-embed — the delta is the proof.
 *
 * READ-ONLY against the database. Spends a few cents of OpenAI embedding
 * tokens. Credentials are read from apps/web/.env.local.
 *
 * USAGE
 *   cd apps/web
 *   node scripts/wave2-eval.mjs
 *
 * OPTIONS (env)
 *   EVAL_CASES   Cases file (default scripts/wave2-eval-cases.json)
 *   EVAL_OUT     Results JSON path (default wave2-eval-results.json)
 *   EVAL_LABEL   A label stored in the results (e.g. "baseline" / "post-wave2")
 *   EVAL_LIMIT   Top-K depth to retrieve (default 20)
 *
 * CI RECALL-FLOOR GATE (optional — see .github/workflows/rag-eval.yml)
 *   When any of the following are set, the script asserts the measured
 *   recall@20 is at or above the given percentage and exits non-zero if not.
 *   Unset = no assertion (a plain manual run is unchanged).
 *   EVAL_FLOOR_SCOPED_PAGE_AT20   aircraft-scoped page-level recall@20 floor
 *   EVAL_FLOOR_SCOPED_DOC_AT20    aircraft-scoped doc-level  recall@20 floor
 *   EVAL_FLOOR_ORG_DOC_AT20       org-wide       doc-level  recall@20 floor
 *   EVAL_FLOOR_ORG_PAGE_AT20      org-wide       page-level recall@20 floor
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
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      env[m[1]] = v
    }
  } catch (e) {
    console.error(`[wave2-eval] could not read .env.local: ${e.message}`)
  }
  return env
}
const fileEnv = loadEnvLocal()
const getEnv = (k) => process.env[k] || fileEnv[k] || ''

const SUPABASE_URL = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const SUPABASE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')
const OPENAI_KEY = getEnv('OPENAI_API_KEY')
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('[wave2-eval] missing credentials in apps/web/.env.local')
  process.exit(1)
}

const EMBED_MODEL = getEnv('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-large'
const CASES_PATH = resolve(HERE, process.env.EVAL_CASES || 'wave2-eval-cases.json')
const OUT = process.env.EVAL_OUT || 'wave2-eval-results.json'
const LABEL = process.env.EVAL_LABEL || 'baseline'
const TOP_K = Math.max(20, Number(process.env.EVAL_LIMIT) || 20)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const openai = new OpenAI({ apiKey: OPENAI_KEY })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(fn, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.status ?? 0
      if ((status !== 429 && status < 500) || attempt === 5) throw err
      const delay = Math.min(2000 * 2 ** (attempt - 1), 30000)
      console.warn(`[wave2-eval] ${label} retry ${attempt} in ${delay / 1000}s (status ${status})`)
      await sleep(delay)
    }
  }
}

/** Rank (1-based) of the first row matching the predicate, or null. */
function firstRank(rows, pred) {
  for (let i = 0; i < rows.length; i++) if (pred(rows[i])) return i + 1
  return null
}

async function retrieve(orgId, aircraftId, queryVector, queryText) {
  const { data, error } = await withRetry(
    () =>
      supabase.rpc('search_canonical_documents', {
        p_organization_id: orgId,
        p_aircraft_id: aircraftId,
        p_query_embedding: queryVector,
        p_query_text: queryText,
        p_doc_type_filter: null,
        p_limit: TOP_K,
      }),
    'rpc',
  )
  if (error) throw new Error(`RPC failed: ${error.message}`)
  return Array.isArray(data) ? data : []
}

// ─── one case ───────────────────────────────────────────────────────────────
async function runCase(orgId, tailToId, c) {
  const emb = await withRetry(
    () => openai.embeddings.create({ model: EMBED_MODEL, input: c.question, dimensions: 1536 }),
    'embed',
  )
  const queryVector = emb.data[0].embedding

  const goldDocs = new Set(c.gold_document_ids)
  const goldPages = new Set(c.gold_pages)
  const pageHit = (r) => goldDocs.has(r.document_id) && goldPages.has(r.page_number)
  const docHit = (r) => goldDocs.has(r.document_id)

  // Org-wide ("All Aircraft" path).
  const orgRows = await retrieve(orgId, null, queryVector, c.question)
  const orgWide = { pageRank: firstRank(orgRows, pageHit), docRank: firstRank(orgRows, docHit) }

  // Aircraft-scoped path — tail parsed from the question, if any.
  const tail = (c.question.match(/\bN[0-9][0-9A-Z]{1,5}\b/) || [])[0]
  const aircraftId = tail ? tailToId.get(tail) || null : null
  let scoped = null
  if (aircraftId) {
    const scopedRows = await retrieve(orgId, aircraftId, queryVector, c.question)
    scoped = { pageRank: firstRank(scopedRows, pageHit), docRank: firstRank(scopedRows, docHit) }
  }

  return { id: c.id, doc_type: c.doc_type, tail: tail || null, scoped_available: !!aircraftId, orgWide, scoped }
}

async function runPool(items, concurrency, worker) {
  let idx = 0
  const results = new Array(items.length)
  async function lane() {
    while (idx < items.length) {
      const i = idx++
      try {
        results[i] = await worker(items[i], i)
      } catch (err) {
        results[i] = { id: items[i].id, doc_type: items[i].doc_type, error: String(err?.message || err) }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, lane))
  return results
}

// ─── aggregate one scope ────────────────────────────────────────────────────
function summarize(results, pick) {
  const scored = results.filter((r) => !r.error && pick(r))
  const pageRank = (r) => pick(r).pageRank
  const docRank = (r) => pick(r).docRank
  const recallAt = (rankFn, k) => scored.filter((r) => rankFn(r) && rankFn(r) <= k).length
  const mrr =
    scored.reduce((s, r) => s + (pageRank(r) ? 1 / pageRank(r) : 0), 0) / (scored.length || 1)
  const pct = (x) => Math.round((x / (scored.length || 1)) * 100)
  return {
    n: scored.length,
    page: {
      at5: recallAt(pageRank, 5),
      at10: recallAt(pageRank, 10),
      at20: recallAt(pageRank, 20),
      at5_pct: pct(recallAt(pageRank, 5)),
      at10_pct: pct(recallAt(pageRank, 10)),
      at20_pct: pct(recallAt(pageRank, 20)),
      mrr: +mrr.toFixed(4),
    },
    doc: {
      at5: recallAt(docRank, 5),
      at10: recallAt(docRank, 10),
      at20: recallAt(docRank, 20),
      at5_pct: pct(recallAt(docRank, 5)),
      at10_pct: pct(recallAt(docRank, 10)),
      at20_pct: pct(recallAt(docRank, 20)),
    },
  }
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const spec = JSON.parse(readFileSync(CASES_PATH, 'utf8'))
  const cases = (spec.cases || []).filter((c) => !String(c.id).startsWith('TEMPLATE'))
  const orgId = spec.org_id
  if (!orgId) throw new Error('cases file missing org_id')
  if (cases.length === 0) throw new Error('no runnable cases')

  // Resolve tail -> aircraft_id for the org.
  const { data: acRows, error: acErr } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', orgId)
  if (acErr) throw new Error(`aircraft query failed: ${acErr.message}`)
  const tailToId = new Map((acRows || []).map((a) => [a.tail_number, a.id]))

  console.log(
    `[wave2-eval] label=${LABEL}  cases=${cases.length}  model=${EMBED_MODEL}  ` +
      `top-K=${TOP_K}  org-aircraft=${tailToId.size}`,
  )

  const results = await runPool(cases, 4, (c) => runCase(orgId, tailToId, c))

  const orgWideSummary = summarize(results, (r) => r.orgWide)
  const scopedSummary = summarize(results, (r) => r.scoped)
  const errors = results.filter((r) => r.error)

  const summary = {
    label: LABEL,
    generated_at: new Date().toISOString(),
    cases_total: results.length,
    cases_errored: errors.length,
    org_wide: orgWideSummary,
    aircraft_scoped: scopedSummary,
    per_case: results.map((r) =>
      r.error
        ? { id: r.id, error: r.error }
        : {
            id: r.id,
            doc_type: r.doc_type,
            tail: r.tail,
            org_wide_page_rank: r.orgWide.pageRank,
            org_wide_doc_rank: r.orgWide.docRank,
            scoped_page_rank: r.scoped?.pageRank ?? null,
            scoped_doc_rank: r.scoped?.docRank ?? null,
          },
    ),
  }
  writeFileSync(resolve(process.cwd(), OUT), JSON.stringify(summary, null, 2))

  // ── print ──
  console.log('')
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.id.padEnd(32)} ERROR: ${r.error}`)
      continue
    }
    const o = r.orgWide.pageRank ? `page@${r.orgWide.pageRank}` : r.orgWide.docRank ? `doc@${r.orgWide.docRank}` : 'miss'
    const s = r.scoped
      ? r.scoped.pageRank
        ? `page@${r.scoped.pageRank}`
        : r.scoped.docRank
          ? `doc@${r.scoped.docRank}`
          : 'miss'
      : 'n/a'
    console.log(`  ${r.id.padEnd(32)} org-wide:${o.padEnd(10)} scoped:${s}`)
  }

  const block = (title, s) => {
    console.log(`\n  ${title}  (${s.n} cases)`)
    console.log(`    page-level recall@5/@10/@20: ${s.page.at5_pct}% / ${s.page.at10_pct}% / ${s.page.at20_pct}%   MRR ${s.page.mrr}`)
    console.log(`    doc-level  recall@5/@10/@20: ${s.doc.at5_pct}% / ${s.doc.at10_pct}% / ${s.doc.at20_pct}%`)
  }
  console.log(`\n══════════ WAVE 2 RETRIEVAL EVAL — ${LABEL.toUpperCase()} ══════════`)
  block('ORG-WIDE  (All-Aircraft path)', orgWideSummary)
  block('AIRCRAFT-SCOPED  (aircraft-selected path)', scopedSummary)
  if (errors.length) console.log(`\n  ${errors.length} case(s) errored`)
  console.log('═══════════════════════════════════════════════════════')
  console.log(`\nResults written to ${OUT}`)

  // ── CI recall-floor gate ────────────────────────────────────────────────
  // Each floor is opt-in via an env var. With none set this block is a no-op,
  // so a plain `node scripts/wave2-eval.mjs` run behaves exactly as before.
  const floorChecks = [
    ['EVAL_FLOOR_SCOPED_PAGE_AT20', 'aircraft-scoped page-recall@20', scopedSummary.page.at20_pct],
    ['EVAL_FLOOR_SCOPED_DOC_AT20', 'aircraft-scoped doc-recall@20', scopedSummary.doc.at20_pct],
    ['EVAL_FLOOR_ORG_DOC_AT20', 'org-wide doc-recall@20', orgWideSummary.doc.at20_pct],
    ['EVAL_FLOOR_ORG_PAGE_AT20', 'org-wide page-recall@20', orgWideSummary.page.at20_pct],
  ]
  const breaches = []
  for (const [envKey, label, measuredPct] of floorChecks) {
    const raw = process.env[envKey]
    if (raw === undefined || raw === '') continue
    const floor = Number(raw)
    if (!Number.isFinite(floor)) {
      console.error(`[wave2-eval] ignoring ${envKey}="${raw}" — not a number`)
      continue
    }
    const verdict = measuredPct >= floor ? 'ok' : 'BELOW FLOOR'
    console.log(`  gate: ${label}  measured ${measuredPct}%  floor ${floor}%  → ${verdict}`)
    if (measuredPct < floor) breaches.push(`${label}: ${measuredPct}% < ${floor}%`)
  }
  if (errors.length) {
    // A retrieval RPC / embedding failure makes the recall numbers untrustworthy
    // — fail the gate rather than pass on an artificially low denominator.
    breaches.push(`${errors.length} eval case(s) errored — recall numbers unreliable`)
  }
  if (breaches.length > 0) {
    console.error('\n[wave2-eval] RECALL REGRESSION — CI gate failed:')
    for (const b of breaches) console.error(`  ✗ ${b}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[wave2-eval] FATAL:', err?.stack || err?.message || err)
  process.exit(1)
})
