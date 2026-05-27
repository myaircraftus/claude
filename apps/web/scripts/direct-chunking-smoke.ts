#!/usr/bin/env -S tsx
/**
 * Smoke test for the direct-chunking module.
 *
 * Calls the real exported function (`runDirectChunkingPage`) from
 * `apps/web/lib/ocr/direct-chunking.ts` against a few pages of the airframe
 * test logbook so we can verify:
 *   - Per-family schema + prompt builds without runtime error.
 *   - HTTP call succeeds and JSON parses.
 *   - Server-side page_number stamping works.
 *   - chunks[] are family-shaped (chunk_kind in the logbook enum).
 *   - events[] carry valid source_chunk_index back-refs.
 *
 * NO DB writes. NO ingestion-orchestrator path. Just the OCR module.
 *
 * Usage:
 *   cd apps/web
 *   pnpm exec tsx scripts/direct-chunking-smoke.ts
 *
 * Env overrides:
 *   SMOKE_PAGES=1,7,10  pages to test (1-based; default: 1,7)
 *   SMOKE_PDF=...        absolute path to a test PDF
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(APP_ROOT, '..', '..')

// ─── Load .env.local before importing the module so process.env is set
//     before any env reads inside the module. ─────────────────────────────
function loadEnvLocal() {
  for (const line of readFileSync(resolve(APP_ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}
loadEnvLocal()

// Direct-chunking is ON by default after the production-flip — no env override
// needed. Operator can pass OCR_DIRECT_CHUNKING=false to test the disabled
// path, or OCR_DIRECT_CHUNKING_PROVIDER=openai|gemini to pin a backend.

async function main() {
  // Import AFTER env is set (the module reads process.env at call time, not
  // import time, but this order also documents the dependency).
  const {
    runDirectChunkingPage,
    shouldUseDirectChunkingFor,
    isDirectChunkingEnabled,
    DIRECT_CHUNKING_SOURCE_TAG,
  } = await import('../lib/ocr/direct-chunking.js')
  const { inferDocumentFamily } = await import('../lib/ocr/segments.js')

  // ── Structural checks (don't need the API) ──────────────────────────────
  console.log('[smoke] === structural checks (no API call) ===')
  const FAMILIES_TO_PROBE: Array<[string, string]> = [
    ['logbook', 'logbook'],
    ['work_order', 'work_order'],
    ['airworthiness_directive', 'ad_sb'],
    ['inspection_report', 'inspection'],
    ['poh', 'manual_reference'],
    ['miscellaneous', 'general'],
  ]
  for (const [docType, expectedFamily] of FAMILIES_TO_PROBE) {
    const family = inferDocumentFamily(docType)
    const eligible = shouldUseDirectChunkingFor(docType)
    console.log(
      `  docType=${docType.padEnd(24)}  family=${family.padEnd(18)}  ` +
        `expected=${expectedFamily.padEnd(18)}  flag-eligible=${eligible}`,
    )
    if (family !== expectedFamily) {
      console.error(`  [FAIL] family mismatch for ${docType}`)
      process.exit(1)
    }
  }
  console.log(`[smoke] enabled-master=${isDirectChunkingEnabled()}`)
  console.log(`[smoke] source-tag=${DIRECT_CHUNKING_SOURCE_TAG}`)
  console.log('[smoke] structural checks: PASS\n')

  // ── Live API check (needs the right key for the active provider) ──────
  const provider = (process.env.OCR_DIRECT_CHUNKING_PROVIDER || 'gemini').toLowerCase()
  const keyVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
  if (!process.env[keyVar]) {
    console.log(`[smoke] provider=${provider} requires ${keyVar} — empty in apps/web/.env.local; skipping live API check.`)
    console.log('[smoke] Set the key and re-run to exercise the full module end-to-end.')
    return
  }
  console.log(`[smoke] live API check via provider=${provider}, key=${keyVar}`)

  const PDF_PATH =
    process.env.SMOKE_PDF ||
    resolve(REPO_ROOT, '.tmp', '2019ae69-2080-41e7-99b8-8e17e773564a.pdf')
  const PAGES = (process.env.SMOKE_PAGES || '1,7')
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1)
  const DOC_TYPE = 'logbook'
  const TITLE = 'logbook-jeet-v10 (smoke)'
  const MAKE = 'Cessna'
  const MODEL = '152'

  console.log(`[smoke] === live API check ===`)
  console.log(`[smoke] pdf=${PDF_PATH}`)
  console.log(`[smoke] doc_type=${DOC_TYPE}  family=${inferDocumentFamily(DOC_TYPE)}`)
  console.log(`[smoke] flag-eligible=${shouldUseDirectChunkingFor(DOC_TYPE)}`)
  console.log(`[smoke] pages=${PAGES.join(',')}`)

  const sourceBytes = readFileSync(PDF_PATH)
  const pdfDoc = await PDFDocument.load(sourceBytes)
  const family = inferDocumentFamily(DOC_TYPE)

  const OUT_DIR = resolve(REPO_ROOT, '.tmp', 'direct-chunking-smoke-output')
  mkdirSync(OUT_DIR, { recursive: true })

  let okCount = 0
  const summary: Array<Record<string, unknown>> = []

  for (const pageNumber of PAGES) {
    console.log(`\n[smoke] page ${pageNumber} ...`)
    const t0 = Date.now()
    try {
      const result = await runDirectChunkingPage({
        pdfDoc,
        pageNumber,
        family,
        docType: DOC_TYPE,
        title: TITLE,
        make: MAKE,
        model: MODEL,
      })
      const ms = Date.now() - t0
      okCount++

      const kinds = [...new Set(result.chunks.map((c) => c.chunk_kind))]
      const canonicalCount = result.chunks.filter((c) => c.is_canonical_candidate).length
      const eventsValid = result.events.every(
        (e) => e.source_chunk_index >= 0 && e.source_chunk_index < result.chunks.length,
      )

      const summaryRow = {
        page: pageNumber,
        latency_ms: ms,
        page_classification: result.page_classification,
        raw_text_len: result.raw_text.length,
        overall_confidence: result.overall_confidence,
        total_chunks: result.chunks.length,
        canonical_chunks: canonicalCount,
        chunk_kinds: kinds,
        events_count: result.events.length,
        events_back_refs_valid: eventsValid,
        page_number_server_stamped:
          result.page_number === pageNumber ? 'YES' : `BUG: got ${result.page_number}`,
        tail: result.tail_number_visible,
        make: result.aircraft_make_visible,
        model: result.aircraft_model_visible,
      }
      summary.push(summaryRow)
      console.log(JSON.stringify(summaryRow, null, 2))

      writeFileSync(
        resolve(OUT_DIR, `page-${String(pageNumber).padStart(3, '0')}.json`),
        JSON.stringify(result, null, 2),
      )
    } catch (err) {
      console.error(`[smoke] page ${pageNumber} FAILED:`, err)
      summary.push({ page: pageNumber, error: err instanceof Error ? err.message : String(err) })
    }
  }

  writeFileSync(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2))

  console.log(`\n[smoke] done — ${okCount}/${PAGES.length} pages succeeded`)
  console.log(`[smoke] full payloads in ${OUT_DIR}/`)

  if (okCount < PAGES.length) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[smoke] FATAL:', err)
  process.exit(1)
})
