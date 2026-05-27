#!/usr/bin/env -S tsx
/**
 * Cross-family verification harness for the direct-chunking pipeline.
 *
 * Reusable diagnostic — picks a representative OCR doc per family from the
 * DB, runs direct-chunking on 2-3 representative pages, prints the
 * structural signals + a side-by-side with the LEGACY canonical chunks
 * already in the DB for the same pages. No DB writes, no re-ingestion;
 * ~15 OpenAI calls total (~$0.10).
 *
 * Lives here (not .tmp/) because it imports app TS modules
 * (lib/ocr/direct-chunking) whose npm deps are only resolvable from
 * apps/web/node_modules. Matches the convention of the other verify-*
 * and smoke-* scripts in this directory.
 *
 * Usage (run from apps/web):
 *   pnpm exec tsx scripts/verify-all-families.ts
 *
 *   # filter to specific families (after a prompt fix, etc.):
 *   pnpm exec tsx scripts/verify-all-families.ts work_order,inspection
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '..')
const REPO_ROOT = resolve(APP_ROOT, '..', '..')

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

// Force direct-chunking on for every family — we're testing each one's prompt
// + schema combination regardless of the default allow-list state.
process.env.OCR_DIRECT_CHUNKING = 'true'
process.env.OCR_DIRECT_CHUNKING_FAMILIES =
  'logbook,work_order,inspection,ad_sb,manual_reference,general'

async function main() {
  const { runDirectChunkingPage } = await import('../lib/ocr/direct-chunking.js')
  const { inferDocumentFamily } = await import('../lib/ocr/segments.js')

  const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await pgClient.connect()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const ALL_TARGETS: Array<{ family: string; doc_types: string[]; label: string }> = [
    { family: 'work_order',       doc_types: ['work_order'],                                          label: 'WORK_ORDER' },
    { family: 'inspection',       doc_types: ['inspection_report'],                                   label: 'INSPECTION' },
    { family: 'ad_sb',            doc_types: ['airworthiness_directive', 'service_bulletin'],         label: 'AD_SB' },
    { family: 'manual_reference', doc_types: ['poh', 'afm', 'afm_supplement', 'maintenance_manual', 'service_manual', 'parts_catalog'], label: 'MANUAL_REFERENCE' },
    { family: 'general',          doc_types: ['form_337', 'form_8130', 'miscellaneous', 'compliance', 'lease_ownership'], label: 'GENERAL' },
  ]

  // Optional CLI filter: `tsx verify-all-families.ts work_order,inspection`
  // runs only the listed families. Useful when re-verifying after a prompt fix.
  const filterArg = process.argv[2]?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
  const TARGETS = filterArg.length > 0
    ? ALL_TARGETS.filter((t) => filterArg.includes(t.family))
    : ALL_TARGETS
  if (filterArg.length > 0) {
    console.log(`(filtered to families: ${TARGETS.map((t) => t.family).join(', ')})`)
  }

  const OUT_DIR = resolve(REPO_ROOT, '.tmp', 'verify-all-families-output')
  mkdirSync(OUT_DIR, { recursive: true })

  for (const target of TARGETS) {
    console.log(`\n══════════════════════════════════════════════════════════════════`)
    console.log(`▌ FAMILY: ${target.label}`)
    console.log(`══════════════════════════════════════════════════════════════════`)

    const { rows: candidates } = await pgClient.query(
      `SELECT d.id, d.title, d.doc_type, d.file_path, d.file_name, d.page_count,
              (SELECT count(*)::int FROM document_pages WHERE document_id = d.id AND length(page_text) > 100) AS rich_pages
         FROM documents d
        WHERE d.doc_type = ANY($1)
          AND d.parsing_status = 'completed'
          AND d.is_text_native = false
          AND d.page_count BETWEEN 3 AND 120
        ORDER BY (SELECT count(*)::int FROM document_pages WHERE document_id = d.id AND length(page_text) > 100) DESC,
                 d.uploaded_at DESC
        LIMIT 3`,
      [target.doc_types],
    )

    if (candidates.length === 0) {
      console.log(`(no OCR docs found for doc_types ${target.doc_types.join(', ')} — family is untestable on this DB)`)
      continue
    }

    const doc = candidates[0]
    console.log(`sample doc: ${doc.title} (${doc.id})`)
    console.log(`  doc_type=${doc.doc_type}  pages=${doc.page_count}  rich_pages=${doc.rich_pages}`)
    console.log(`  inferred family: ${inferDocumentFamily(doc.doc_type)} (expected: ${target.family})`)

    const { data: signed, error: signErr } = await supabase
      .storage.from('documents').createSignedUrl(doc.file_path, 3600)
    if (signErr || !signed?.signedUrl) {
      console.log(`  ✗ failed to sign URL: ${signErr?.message ?? 'no URL'}`)
      continue
    }

    const pdfResp = await fetch(signed.signedUrl)
    if (!pdfResp.ok) {
      console.log(`  ✗ failed to download PDF: HTTP ${pdfResp.status}`)
      continue
    }
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer())
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const realPageCount = pdfDoc.getPageCount()

    const middle = Math.max(1, Math.floor(realPageCount / 2))
    const last = realPageCount
    const pages = [...new Set([1, middle, last])].filter((p) => p >= 1 && p <= realPageCount)
    console.log(`  pages to test: ${pages.join(', ')} (of ${realPageCount})`)

    const family = inferDocumentFamily(doc.doc_type)
    const familyResults: Array<{ page: number; result: any; error?: string }> = []

    for (const pageNumber of pages) {
      console.log(`\n  ── page ${pageNumber} (${target.label}) ──`)
      const t0 = Date.now()
      try {
        const result = await runDirectChunkingPage({
          pdfDoc,
          pageNumber,
          family,
          docType: doc.doc_type,
          title: doc.title ?? doc.file_name,
          make: null,
          model: null,
        })
        const ms = Date.now() - t0

        const kinds = [...new Set(result.chunks.map((c: any) => c.chunk_kind))]
        const canonicalCount = result.chunks.filter((c: any) => c.is_canonical_candidate).length
        const eventsValid = result.events.every(
          (e: any) => e.source_chunk_index >= 0 && e.source_chunk_index < result.chunks.length,
        )

        console.log(`  latency=${ms}ms  cls=${result.page_classification}  conf=${result.overall_confidence.toFixed(2)}`)
        console.log(`  raw_text_len=${result.raw_text.length}  chunks=${result.chunks.length}  canonical=${canonicalCount}  events=${result.events.length}`)
        console.log(`  chunk_kinds: [${kinds.join(', ')}]`)
        if (result.events.length > 0) {
          console.log(`  events back-refs valid: ${eventsValid ? 'YES ✓' : 'NO ✗'}`)
        }

        if (result.chunks.length > 0) {
          const c0 = result.chunks[0]
          console.log(`  first chunk: kind=${c0.chunk_kind} canonical=${c0.is_canonical_candidate} len=${c0.text.length}`)
          console.log(`    "${c0.text.replace(/\s+/g, ' ').slice(0, 200)}"`)
          if (c0.family_metadata && Object.keys(c0.family_metadata).length > 0) {
            const populated = Object.entries(c0.family_metadata)
              .filter(([_, v]) => v !== null && v !== undefined && (Array.isArray(v) ? v.length > 0 : true))
            if (populated.length > 0) {
              console.log(`    family_metadata populated: ${populated.map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 60)}`).join(', ')}`)
            }
          }
        }

        const { rows: legacyChunks } = await pgClient.query(
          `SELECT chunk_index, length(chunk_text) AS len,
                  metadata_json->>'source' AS source,
                  metadata_json->>'chunk_kind' AS kind,
                  left(chunk_text, 200) AS preview
             FROM canonical_document_chunks
            WHERE document_id = $1 AND page_number = $2
            ORDER BY chunk_index
            LIMIT 5`,
          [doc.id, pageNumber],
        )
        if (legacyChunks.length > 0) {
          console.log(`\n  LEGACY for same page (${legacyChunks.length} chunks):`)
          legacyChunks.forEach((lc: any, i: number) => {
            console.log(`    [${i}] source=${lc.source ?? '(null)'} kind=${lc.kind ?? '(null)'} len=${lc.len}: "${(lc.preview ?? '').replace(/\s+/g, ' ').slice(0, 140)}"`)
          })
        }

        familyResults.push({ page: pageNumber, result })
      } catch (err: any) {
        console.log(`  ✗ FAILED: ${err?.message ?? err}`)
        familyResults.push({ page: pageNumber, result: null, error: err?.message })
      }
    }

    writeFileSync(
      resolve(OUT_DIR, `family-${target.family}.json`),
      JSON.stringify({ family: target.family, doc, pages, results: familyResults }, null, 2),
    )
  }

  await pgClient.end()
  console.log(`\n\n══════════════════════════════════════════════════════════════════`)
  console.log('Full per-family payloads saved to:', OUT_DIR)
  console.log('══════════════════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
