#!/usr/bin/env -S tsx
/**
 * 3-Way Document-Intelligence Bake-Off — OCR + Chunking quality
 *
 *   A = Gemini 3 Flash Preview  (current pipeline primary)
 *   B = OpenAI GPT-4o           (current pipeline fallback)
 *   C = Landing AI ADE / DPT-2  (candidate — agentic document extraction)
 *
 *   Judge = GPT-4o with vision (sees the page image + the three outputs)
 *
 * GOAL
 *   On MyAircraft's own handwritten airframe logbook, which engine produces
 *   the most accurate OCR and the most retrieval-useful chunking? Hard numbers
 *   scored against the actual page image, plus side-by-side dumps to eyeball.
 *
 * METHOD (one call per engine per page — production-faithful)
 *   A/B come from the REAL pipeline function `runDirectChunkingPage`
 *   (lib/ocr/direct-chunking.ts): its `raw_text` is exactly what the pipeline
 *   persists as the page OCR, and its `chunks[]` are the family-aware chunks the
 *   canonical layer ingests. Provider is pinned per call via
 *   OCR_DIRECT_CHUNKING_PROVIDER. C comes from one Landing AI ADE `parse` call:
 *   `markdown` = its OCR, `chunks[]` = its layout chunking.
 *
 *   Two GPT-4o-vision judge passes per page:
 *     - OCR axis      → transcription fidelity vs the page image
 *     - Chunking axis → boundary correctness / completeness / canonical hygiene
 *
 * INPUTS  (apps/web/.env.local)
 *   GEMINI_API_KEY, OPENAI_API_KEY, LANDINGAI_API_KEY (or VISION_AGENT_API_KEY)
 *   Source PDF + page renders default to the airframe logbook in .tmp/.
 *
 * USAGE
 *   cd apps/web
 *   pnpm exec tsx scripts/ocr-3way-bakeoff.ts                 # all rendered pages
 *   BAKEOFF_PAGES=7 pnpm exec tsx scripts/ocr-3way-bakeoff.ts # smoke: one page
 *   BAKEOFF_PAGES=4,5,7,9 pnpm exec tsx scripts/ocr-3way-bakeoff.ts
 *   BAKEOFF_MAX_PAGES=5 pnpm exec tsx scripts/ocr-3way-bakeoff.ts
 *
 * NO DB writes. NO production-pipeline mutation.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '..') // apps/web
const REPO_ROOT = resolve(APP_ROOT, '..', '..')

// ─── Load .env.local before importing the pipeline module ──────────────────
function loadEnvLocal() {
  const path = resolve(APP_ROOT, '.env.local')
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}
loadEnvLocal()

const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
const LANDING_KEY = process.env.LANDINGAI_API_KEY || process.env.VISION_AGENT_API_KEY || ''
const GPT_MODEL = process.env.OPENAI_OCR_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o'
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'gpt-4o'
const LANDING_MODEL = process.env.LANDING_MODEL || 'dpt-2-latest'
const LANDING_URL = process.env.LANDING_URL || 'https://api.va.landing.ai/v1/ade/parse'

// ─── Test document (the handwritten N92995 Cessna 152 airframe logbook) ────
const SOURCE_PDF =
  process.env.BAKEOFF_PDF ||
  resolve(REPO_ROOT, '.tmp', 'abae553b-e071-46ca-a897-61b0a602e2d2.pdf')
const PAGES_DIR = process.env.BAKEOFF_PAGES_DIR || resolve(REPO_ROOT, '.tmp', 'af-pdf-pages')
const DOC_TYPE = 'logbook'
const TITLE = 'N92995 Cessna 152 airframe log (bake-off)'
const MAKE = 'Cessna'
const MODEL = '152'

const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const OUT_DIR = join(REPO_ROOT, '.tmp', `ocr-3way-bakeoff-${TS}`)

// Published per-page pricing (May–2026), for the cost note in the report.
const PRICE_NOTE =
  'Gemini 3 Flash Preview ~$0.003/page · GPT-4o ~$0.010/page · Landing AI 3 credits/page (DPT-2).'

// ─── Types we touch from the pipeline module ───────────────────────────────
interface DirectChunk {
  chunk_index: number
  chunk_kind: string
  text: string
  section_title: string | null
  confidence: number
  is_canonical_candidate: boolean
  family_metadata: Record<string, unknown>
}
interface DirectChunkPageResult {
  page_number: number
  page_classification: string | null
  raw_text: string
  overall_confidence: number
  tail_number_visible: string | null
  chunks: DirectChunk[]
  events: unknown[]
  ocr_engine: string
}
interface LandingChunk {
  markdown?: string
  text?: string
  type?: string
  id?: string
  grounding?: { box?: unknown; page?: number }
}

// ─── OpenAI chat completions (raw fetch — judges) ──────────────────────────
async function openaiChat(body: Record<string, unknown>): Promise<any> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '(no body)')
    throw new Error(`OpenAI HTTP ${resp.status}: ${errText.slice(0, 300)}`)
  }
  return resp.json()
}

// ─── pdf-lib: extract a single page as its own 1-page PDF ──────────────────
async function extractPageBytes(pdfDoc: PDFDocument, pageNumber: number): Promise<Uint8Array> {
  const single = await PDFDocument.create()
  const [copied] = await single.copyPages(pdfDoc, [pageNumber - 1])
  single.addPage(copied)
  return single.save()
}

// ─── C: Landing AI ADE parse (Bearer; multipart 1-page PDF) ────────────────
function stripAnchors(md: string): string {
  return md
    .replace(/<a id=['"][^'"]*['"]>\s*<\/a>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
async function callLandingParse(pdfBytes: Uint8Array, filename: string) {
  const t0 = Date.now()
  try {
    const form = new FormData()
    form.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), filename)
    form.append('model', LANDING_MODEL)
    // Bearer is the documented ADE auth; fall back to Basic if the key turns
    // out to be a legacy basic-auth token.
    let resp = await fetch(LANDING_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${LANDING_KEY}` },
      body: form,
    })
    if (resp.status === 401 || resp.status === 403) {
      const form2 = new FormData()
      form2.append('document', new Blob([pdfBytes], { type: 'application/pdf' }), filename)
      form2.append('model', LANDING_MODEL)
      resp = await fetch(LANDING_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${LANDING_KEY}` },
        body: form2,
      })
    }
    const ms = Date.now() - t0
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '(no body)')
      return { markdown: '', chunks: [] as LandingChunk[], credit: 0, ms, error: `HTTP ${resp.status}: ${errText.slice(0, 300)}` }
    }
    const j = (await resp.json()) as any
    return {
      markdown: typeof j?.markdown === 'string' ? j.markdown : '',
      chunks: Array.isArray(j?.chunks) ? (j.chunks as LandingChunk[]) : [],
      credit: Number(j?.metadata?.credit_usage) || 0,
      ms,
      error: undefined as string | undefined,
    }
  } catch (e: any) {
    return { markdown: '', chunks: [] as LandingChunk[], credit: 0, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 300) }
  }
}

// ─── A/B: real pipeline direct-chunking, provider pinned ───────────────────
async function runDirectChunking(
  lib: any,
  provider: 'gemini' | 'openai',
  pdfDoc: PDFDocument,
  pageNumber: number,
  family: string,
) {
  const prev = process.env.OCR_DIRECT_CHUNKING_PROVIDER
  process.env.OCR_DIRECT_CHUNKING_PROVIDER = provider
  const t0 = Date.now()
  try {
    const result: DirectChunkPageResult = await lib.runDirectChunkingPage({
      pdfDoc,
      pageNumber,
      family,
      docType: DOC_TYPE,
      title: TITLE,
      make: MAKE,
      model: MODEL,
    })
    return { result, ms: Date.now() - t0, error: undefined as string | undefined }
  } catch (e: any) {
    return { result: null as DirectChunkPageResult | null, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 300) }
  } finally {
    if (prev === undefined) delete process.env.OCR_DIRECT_CHUNKING_PROVIDER
    else process.env.OCR_DIRECT_CHUNKING_PROVIDER = prev
  }
}

// ─── Judge: OCR transcription fidelity ─────────────────────────────────────
async function judgeOcr(pngBase64: string, a: string, b: string, c: string) {
  const resp = await openaiChat({
    model: JUDGE_MODEL,
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You evaluate OCR accuracy for aircraft maintenance logbook pages. You see the original page image and three candidate transcriptions: ' +
          'A (Gemini 3 Flash Preview), B (OpenAI GPT-4o), C (Landing AI ADE / DPT-2). ' +
          'Compare each transcription against the ACTUAL text visible on the page. Ignore formatting, markdown, HTML table syntax, and anchor tags — only agreement of the transcribed CONTENT with the page matters. Do NOT favor any engine by style. ' +
          'Be strict — for aviation records, small errors (wrong date, wrong tach/Hobbs reading, wrong mechanic name, wrong A&P/IA certificate number, missed signature or stamp) matter a lot. ' +
          'Reply with strict JSON: {"winner":"A"|"B"|"C"|"tie","score_a":<0-10>,"score_b":<0-10>,"score_c":<0-10>,' +
          '"a_missed":"<concrete items A failed to capture>","a_wrong":"<concrete items A got wrong/hallucinated>",' +
          '"b_missed":"...","b_wrong":"...","c_missed":"...","c_wrong":"...","summary":"<one-sentence verdict>"}. ' +
          'Score 10 = matches the page exactly; 0 = mostly garbage.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Evaluate three OCR transcriptions against the page image.\n\n' +
              `=== A — Gemini 3 Flash Preview ===\n${(a || '(empty)').slice(0, 6000)}\n\n` +
              `=== B — OpenAI GPT-4o ===\n${(b || '(empty)').slice(0, 6000)}\n\n` +
              `=== C — Landing AI ADE / DPT-2 ===\n${(c || '(empty)').slice(0, 6000)}`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}`, detail: 'high' } },
        ],
      },
    ],
  })
  const raw = resp.choices?.[0]?.message?.content || '{}'
  let judgment: any
  try {
    judgment = JSON.parse(raw)
  } catch {
    judgment = { winner: 'unknown', raw }
  }
  return { judgment, usage: resp.usage || {} }
}

// ─── Judge: chunking quality for retrieval ─────────────────────────────────
function serializeDirectChunks(chunks: DirectChunk[]): string {
  if (!chunks.length) return '(no chunks)'
  return chunks
    .map(
      (c, i) =>
        `[${i}] kind=${c.chunk_kind} canonical=${c.is_canonical_candidate} :: ${c.text.replace(/\s+/g, ' ').slice(0, 220)}`,
    )
    .join('\n')
}
function serializeLandingChunks(chunks: LandingChunk[]): string {
  if (!chunks.length) return '(no chunks)'
  return chunks
    .map(
      (c, i) =>
        `[${i}] type=${c.type ?? 'text'} :: ${stripAnchors(c.markdown || c.text || '').replace(/\s+/g, ' ').slice(0, 220)}`,
    )
    .join('\n')
}
async function judgeChunking(pngBase64: string, aChunks: string, bChunks: string, cChunks: string) {
  const resp = await openaiChat({
    model: JUDGE_MODEL,
    temperature: 0,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You evaluate how well three engines CHUNK an aircraft maintenance logbook page for downstream retrieval (RAG). You see the page image and each engine\'s chunk list. ' +
          'A (Gemini) and B (OpenAI) use DOMAIN-AWARE chunking — ideally ONE chunk per distinct maintenance entry / signoff block, with pre-printed form boilerplate marked canonical=false. ' +
          'C (Landing AI) uses LAYOUT-AWARE chunking — one chunk per layout block (title / table / text). ' +
          'Judge each engine on: (1) BOUNDARY CORRECTNESS — is each distinct retrievable fact (a dated maintenance entry, a mechanic signoff, a table) cleanly isolated in its own chunk, neither merged with unrelated content nor needlessly fragmented; ' +
          '(2) COMPLETENESS — is any substantive page content missing from the chunks; ' +
          '(3) CANONICAL HYGIENE — is pre-printed form boilerplate / repeated column headers kept OUT of (or flagged in) the substantive chunks. ' +
          'Do NOT reward or penalize chunk-type LABEL vocabulary — only practical retrievability and citation granularity. ' +
          'Reply with strict JSON: {"winner":"A"|"B"|"C"|"tie","score_a":<0-10>,"score_b":<0-10>,"score_c":<0-10>,' +
          '"a_notes":"<boundary/completeness/hygiene verdict for A>","b_notes":"...","c_notes":"...","summary":"<one-sentence verdict>"}. ' +
          'Score 10 = ideal retrieval chunks; 0 = unusable.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Evaluate three chunkings of this page against the page image.\n\n' +
              `=== A — Gemini (domain-aware) ===\n${aChunks.slice(0, 6000)}\n\n` +
              `=== B — OpenAI (domain-aware) ===\n${bChunks.slice(0, 6000)}\n\n` +
              `=== C — Landing AI (layout-aware) ===\n${cChunks.slice(0, 6000)}`,
          },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}`, detail: 'high' } },
        ],
      },
    ],
  })
  const raw = resp.choices?.[0]?.message?.content || '{}'
  let judgment: any
  try {
    judgment = JSON.parse(raw)
  } catch {
    judgment = { winner: 'unknown', raw }
  }
  return { judgment, usage: resp.usage || {} }
}

// ─── Page selection ────────────────────────────────────────────────────────
function selectPages(actualPageCount: number): number[] {
  if (process.env.BAKEOFF_PAGES) {
    return process.env.BAKEOFF_PAGES.split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= actualPageCount)
  }
  const all: number[] = []
  for (let p = 1; p <= actualPageCount; p++) {
    if (existsSync(join(PAGES_DIR, `page-${String(p).padStart(3, '0')}.png`))) all.push(p)
  }
  const max = Number(process.env.BAKEOFF_MAX_PAGES || all.length)
  return all.slice(0, max)
}

function readPng(pageNumber: number): string | null {
  const p = join(PAGES_DIR, `page-${String(pageNumber).padStart(3, '0')}.png`)
  if (!existsSync(p)) return null
  return readFileSync(p).toString('base64')
}

interface PageRow {
  page: number
  classification: string | null
  gemini: { raw_text: string; chunks: DirectChunk[]; ms: number; error?: string }
  openai: { raw_text: string; chunks: DirectChunk[]; ms: number; error?: string }
  landing: { markdown: string; chunks: LandingChunk[]; credit: number; ms: number; error?: string }
  ocr: any | null
  chunk: any | null
}

async function main() {
  console.log('[bakeoff] 3-Way OCR + Chunking Bake-Off')
  console.log('  A = Gemini 3 Flash Preview (runDirectChunkingPage, provider=gemini)')
  console.log(`  B = OpenAI ${GPT_MODEL} (runDirectChunkingPage, provider=openai)`)
  console.log(`  C = Landing AI ADE (${LANDING_MODEL})`)
  console.log(`  Judge = ${JUDGE_MODEL} (vision)`)

  // Key presence
  const missing: string[] = []
  if (!GEMINI_KEY) missing.push('GEMINI_API_KEY')
  if (!OPENAI_KEY) missing.push('OPENAI_API_KEY')
  if (!LANDING_KEY) missing.push('LANDINGAI_API_KEY')
  if (missing.length) {
    console.error(`[bakeoff] missing keys in apps/web/.env.local: ${missing.join(', ')}`)
    process.exit(1)
  }
  if (!existsSync(SOURCE_PDF)) {
    console.error(`[bakeoff] source PDF not found: ${SOURCE_PDF}`)
    process.exit(1)
  }

  // Import the real pipeline module AFTER env is loaded.
  const lib = await import('../lib/ocr/direct-chunking.js')
  const { inferDocumentFamily } = await import('../lib/ocr/segments.js')
  const family: string = inferDocumentFamily(DOC_TYPE)

  const pdfBytes = readFileSync(SOURCE_PDF)
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const actualPageCount = pdfDoc.getPageCount()
  const pages = selectPages(actualPageCount)

  console.log(`  source: ${SOURCE_PDF} (${actualPageCount} pages)`)
  console.log(`  family: ${family}  ·  pages: ${pages.join(', ')}`)
  console.log(`  output: ${OUT_DIR}\n`)
  mkdirSync(OUT_DIR, { recursive: true })

  const rows: PageRow[] = []
  let landingCreditTotal = 0
  const cost = { judge: 0 }

  for (const page of pages) {
    process.stdout.write(`  page ${page}: `)
    const pageBytes = await extractPageBytes(pdfDoc, page)

    // Landing AI (env-agnostic) runs concurrently with the pinned Gemini call.
    const [landing, gemini] = await Promise.all([
      callLandingParse(pageBytes, `page-${String(page).padStart(3, '0')}.pdf`),
      runDirectChunking(lib, 'gemini', pdfDoc, page, family),
    ])
    // OpenAI after Gemini (both mutate the provider env var).
    const openai = await runDirectChunking(lib, 'openai', pdfDoc, page, family)
    landingCreditTotal += landing.credit

    const gRaw = gemini.result?.raw_text || ''
    const oRaw = openai.result?.raw_text || ''
    const lMd = landing.markdown || ''
    process.stdout.write(`A=${gRaw.length}ch${gemini.error ? '(✗)' : ''} B=${oRaw.length}ch${openai.error ? '(✗)' : ''} C=${lMd.length}ch${landing.error ? '(✗)' : ''}`)

    // Dumps
    const tag = String(page).padStart(3, '0')
    writeFileSync(join(OUT_DIR, `page-${tag}-A-gemini.txt`), gRaw || `(empty${gemini.error ? ': ' + gemini.error : ''})`)
    writeFileSync(join(OUT_DIR, `page-${tag}-B-openai.txt`), oRaw || `(empty${openai.error ? ': ' + openai.error : ''})`)
    writeFileSync(join(OUT_DIR, `page-${tag}-C-landing.txt`), stripAnchors(lMd) || `(empty${landing.error ? ': ' + landing.error : ''})`)
    writeFileSync(
      join(OUT_DIR, `page-${tag}-chunks.json`),
      JSON.stringify(
        {
          page,
          gemini_chunks: gemini.result?.chunks ?? [],
          openai_chunks: openai.result?.chunks ?? [],
          landing_chunks: landing.chunks,
        },
        null,
        2,
      ),
    )

    const png = readPng(page)
    let ocr: any = null
    let chunk: any = null
    if (png && gRaw.trim() && oRaw.trim() && lMd.trim()) {
      try {
        const [ocrJ, chunkJ] = await Promise.all([
          judgeOcr(png, gRaw, oRaw, lMd),
          judgeChunking(
            png,
            serializeDirectChunks(gemini.result?.chunks ?? []),
            serializeDirectChunks(openai.result?.chunks ?? []),
            serializeLandingChunks(landing.chunks),
          ),
        ])
        ocr = ocrJ.judgment
        chunk = chunkJ.judgment
        for (const u of [ocrJ.usage, chunkJ.usage]) {
          cost.judge += ((u.prompt_tokens || 0) * 2.5 + (u.completion_tokens || 0) * 10) / 1_000_000
        }
        process.stdout.write(
          `  OCR→${ocr.winner}(${ocr.score_a}/${ocr.score_b}/${ocr.score_c}) CHUNK→${chunk.winner}(${chunk.score_a}/${chunk.score_b}/${chunk.score_c})`,
        )
      } catch (e: any) {
        process.stdout.write(`  judge-err=${String(e?.message || e).slice(0, 50)}`)
      }
    } else {
      process.stdout.write('  → judge skipped (missing png or an engine returned no text)')
    }
    process.stdout.write(`  [A ${gemini.ms}ms · B ${openai.ms}ms · C ${landing.ms}ms]\n`)

    rows.push({
      page,
      classification: gemini.result?.page_classification ?? openai.result?.page_classification ?? null,
      gemini: { raw_text: gRaw, chunks: gemini.result?.chunks ?? [], ms: gemini.ms, error: gemini.error },
      openai: { raw_text: oRaw, chunks: openai.result?.chunks ?? [], ms: openai.ms, error: openai.error },
      landing: { markdown: lMd, chunks: landing.chunks, credit: landing.credit, ms: landing.ms, error: landing.error },
      ocr,
      chunk,
    })
  }

  // ─── Aggregate ─────────────────────────────────────────────────────────
  const ocrWins = { A: 0, B: 0, C: 0, tie: 0 }
  const chunkWins = { A: 0, B: 0, C: 0, tie: 0 }
  const ocrScore = { a: 0, b: 0, c: 0, n: 0 }
  const chunkScore = { a: 0, b: 0, c: 0, n: 0 }
  const lat = { a: 0, b: 0, c: 0, n: 0 }
  const chunkCounts = { a: 0, b: 0, c: 0, n: 0 }
  for (const r of rows) {
    lat.a += r.gemini.ms; lat.b += r.openai.ms; lat.c += r.landing.ms; lat.n++
    chunkCounts.a += r.gemini.chunks.length; chunkCounts.b += r.openai.chunks.length; chunkCounts.c += r.landing.chunks.length; chunkCounts.n++
    if (r.ocr && typeof r.ocr.score_a === 'number') {
      ocrScore.a += r.ocr.score_a; ocrScore.b += r.ocr.score_b; ocrScore.c += r.ocr.score_c; ocrScore.n++
      const w = r.ocr.winner
      if (w === 'A' || w === 'B' || w === 'C') ocrWins[w as 'A' | 'B' | 'C']++
      else ocrWins.tie++
    }
    if (r.chunk && typeof r.chunk.score_a === 'number') {
      chunkScore.a += r.chunk.score_a; chunkScore.b += r.chunk.score_b; chunkScore.c += r.chunk.score_c; chunkScore.n++
      const w = r.chunk.winner
      if (w === 'A' || w === 'B' || w === 'C') chunkWins[w as 'A' | 'B' | 'C']++
      else chunkWins.tie++
    }
  }
  const avg = (x: number, n: number) => (n ? (x / n).toFixed(1) : '—')

  // ─── Report ────────────────────────────────────────────────────────────
  const L: string[] = []
  L.push('# 3-Way OCR + Chunking Bake-Off — Gemini vs OpenAI vs Landing AI')
  L.push('')
  L.push(`_Generated ${new Date().toISOString()}_`)
  L.push('')
  L.push('## Engines')
  L.push('- **A = Gemini 3 Flash Preview** — via the real `runDirectChunkingPage` (provider=gemini). `raw_text` = pipeline OCR, `chunks` = family-aware chunks.')
  L.push(`- **B = OpenAI ${GPT_MODEL}** — via the real \`runDirectChunkingPage\` (provider=openai).`)
  L.push(`- **C = Landing AI ADE / DPT-2** (\`${LANDING_MODEL}\`) — one \`parse\` call. \`markdown\` = OCR, \`chunks\` = layout chunks.`)
  L.push(`- **Judge = ${JUDGE_MODEL}** with vision (sees the page image + all three outputs).`)
  L.push('')
  L.push('> **Bias note.** The judge is GPT-4o, which is also engine B. The judge scores against the page image, not textual style, but this is not fully blind — read the **A (Gemini) vs C (Landing AI)** comparison with the most confidence and treat B\'s own scores with a small grain of salt.')
  L.push('')
  L.push(`Document: **${TITLE}** · source \`${SOURCE_PDF.replace(REPO_ROOT, '.')}\` · ${rows.length} pages judged.`)
  L.push('')

  L.push('## Headline')
  L.push('')
  L.push('| Axis | Gemini (A) | OpenAI (B) | Landing AI (C) |')
  L.push('|:--|:-:|:-:|:-:|')
  L.push(`| **OCR** avg /10 | ${avg(ocrScore.a, ocrScore.n)} | ${avg(ocrScore.b, ocrScore.n)} | ${avg(ocrScore.c, ocrScore.n)} |`)
  L.push(`| OCR page wins | ${ocrWins.A} | ${ocrWins.B} | ${ocrWins.C} | (ties ${ocrWins.tie})`)
  L.push(`| **Chunking** avg /10 | ${avg(chunkScore.a, chunkScore.n)} | ${avg(chunkScore.b, chunkScore.n)} | ${avg(chunkScore.c, chunkScore.n)} |`)
  L.push(`| Chunking page wins | ${chunkWins.A} | ${chunkWins.B} | ${chunkWins.C} | (ties ${chunkWins.tie})`)
  L.push(`| avg chunks/page | ${avg(chunkCounts.a, chunkCounts.n)} | ${avg(chunkCounts.b, chunkCounts.n)} | ${avg(chunkCounts.c, chunkCounts.n)} |`)
  L.push(`| avg latency/page | ${(lat.a / (lat.n || 1) / 1000).toFixed(1)}s | ${(lat.b / (lat.n || 1) / 1000).toFixed(1)}s | ${(lat.c / (lat.n || 1) / 1000).toFixed(1)}s |`)
  L.push('')
  L.push(`Landing AI credits used: **${landingCreditTotal}** (${rows.length} pages). Judge cost this run: ~$${cost.judge.toFixed(3)}. ${PRICE_NOTE}`)
  L.push('')

  L.push('## OCR axis — per page')
  L.push('')
  L.push('| Page | Class | A /10 | B /10 | C /10 | Winner |')
  L.push('|---:|:--|:-:|:-:|:-:|:-:|')
  for (const r of rows) {
    const j = r.ocr ?? {}
    L.push(`| ${r.page} | ${r.classification ?? '—'} | ${j.score_a ?? '—'} | ${j.score_b ?? '—'} | ${j.score_c ?? '—'} | **${j.winner ?? '—'}** |`)
  }
  L.push('')
  L.push('### OCR judge notes')
  L.push('')
  for (const r of rows) {
    const j = r.ocr
    if (!j) { L.push(`**Page ${r.page}** — judge not run.`); if (r.gemini.error) L.push(`  - A error: ${r.gemini.error}`); if (r.openai.error) L.push(`  - B error: ${r.openai.error}`); if (r.landing.error) L.push(`  - C error: ${r.landing.error}`); L.push(''); continue }
    L.push(`**Page ${r.page}** — winner **${j.winner}** · A=${j.score_a} B=${j.score_b} C=${j.score_c}`)
    L.push(`- _A (Gemini) missed:_ ${j.a_missed || '(none)'} · _wrong:_ ${j.a_wrong || '(none)'}`)
    L.push(`- _B (OpenAI) missed:_ ${j.b_missed || '(none)'} · _wrong:_ ${j.b_wrong || '(none)'}`)
    L.push(`- _C (Landing) missed:_ ${j.c_missed || '(none)'} · _wrong:_ ${j.c_wrong || '(none)'}`)
    L.push(`- _summary:_ ${j.summary || ''}`)
    L.push('')
  }

  L.push('## Chunking axis — per page')
  L.push('')
  L.push('| Page | A chunks | B chunks | C chunks | A /10 | B /10 | C /10 | Winner |')
  L.push('|---:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|')
  for (const r of rows) {
    const j = r.chunk ?? {}
    L.push(`| ${r.page} | ${r.gemini.chunks.length} | ${r.openai.chunks.length} | ${r.landing.chunks.length} | ${j.score_a ?? '—'} | ${j.score_b ?? '—'} | ${j.score_c ?? '—'} | **${j.winner ?? '—'}** |`)
  }
  L.push('')
  L.push('### Chunking judge notes')
  L.push('')
  for (const r of rows) {
    const j = r.chunk
    if (!j) { L.push(`**Page ${r.page}** — judge not run.`); L.push(''); continue }
    L.push(`**Page ${r.page}** — winner **${j.winner}** · A=${j.score_a} B=${j.score_b} C=${j.score_c}`)
    L.push(`- _A (Gemini):_ ${j.a_notes || ''}`)
    L.push(`- _B (OpenAI):_ ${j.b_notes || ''}`)
    L.push(`- _C (Landing):_ ${j.c_notes || ''}`)
    L.push(`- _summary:_ ${j.summary || ''}`)
    L.push('')
  }

  L.push('## How to verify')
  L.push('')
  L.push('Per page, three side-by-side transcriptions + the raw chunk lists are on disk:')
  L.push('- `page-NNN-A-gemini.txt` / `page-NNN-B-openai.txt` / `page-NNN-C-landing.txt`')
  L.push('- `page-NNN-chunks.json` (all three engines\' chunks)')
  L.push(`Diff each against the page render at \`${PAGES_DIR.replace(REPO_ROOT, '.')}/page-NNN.png\`.`)

  const reportPath = join(OUT_DIR, 'REPORT.md')
  writeFileSync(reportPath, L.join('\n'))
  writeFileSync(
    join(OUT_DIR, 'summary.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        document: TITLE,
        source_pdf: SOURCE_PDF,
        pages: rows.map((r) => r.page),
        ocr: { wins: ocrWins, avg: { a: avg(ocrScore.a, ocrScore.n), b: avg(ocrScore.b, ocrScore.n), c: avg(ocrScore.c, ocrScore.n) } },
        chunking: { wins: chunkWins, avg: { a: avg(chunkScore.a, chunkScore.n), b: avg(chunkScore.b, chunkScore.n), c: avg(chunkScore.c, chunkScore.n) } },
        avg_chunks_per_page: { a: avg(chunkCounts.a, chunkCounts.n), b: avg(chunkCounts.b, chunkCounts.n), c: avg(chunkCounts.c, chunkCounts.n) },
        avg_latency_ms: { a: Math.round(lat.a / (lat.n || 1)), b: Math.round(lat.b / (lat.n || 1)), c: Math.round(lat.c / (lat.n || 1)) },
        landing_credits_total: landingCreditTotal,
        judge_cost_usd: Number(cost.judge.toFixed(4)),
        rows: rows.map((r) => ({ page: r.page, ocr: r.ocr, chunk: r.chunk, landing_credit: r.landing.credit })),
      },
      null,
      2,
    ),
  )

  console.log('')
  console.log('[bakeoff] ━━━ DONE ━━━')
  console.log(`  OCR     avg /10:  A(Gemini)=${avg(ocrScore.a, ocrScore.n)}  B(OpenAI)=${avg(ocrScore.b, ocrScore.n)}  C(Landing)=${avg(ocrScore.c, ocrScore.n)}  · wins A/B/C/tie=${ocrWins.A}/${ocrWins.B}/${ocrWins.C}/${ocrWins.tie}`)
  console.log(`  Chunk   avg /10:  A=${avg(chunkScore.a, chunkScore.n)}  B=${avg(chunkScore.b, chunkScore.n)}  C=${avg(chunkScore.c, chunkScore.n)}  · wins A/B/C/tie=${chunkWins.A}/${chunkWins.B}/${chunkWins.C}/${chunkWins.tie}`)
  console.log(`  Landing credits: ${landingCreditTotal}  · judge ~$${cost.judge.toFixed(3)}`)
  console.log(`  Report: ${reportPath}`)
}

main().catch((err) => {
  console.error('[bakeoff] FATAL:', err)
  process.exit(1)
})
