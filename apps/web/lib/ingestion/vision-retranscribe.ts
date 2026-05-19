/**
 * Vision-OCR re-transcription (docs/go-live-plan.md §1).
 *
 * Google Document AI garbles handwritten scanned logbook pages. For pages
 * that look garbled, a GPT-4o vision re-transcription is markedly more
 * accurate — pilot scripts/ocr-pilot.mjs measured 37/40 wins, +7.35/10.
 * This module re-transcribes such pages IN PLACE on the in-memory OCR
 * result, before chunking/segmentation, so the clean text flows through
 * document_pages, the OCR entry segments and the canonical retrieval layer
 * with no replace-and-rerun.
 *
 * Transport: the page is extracted into a 1-page PDF with pdf-lib (headless,
 * no canvas binding) and sent to GPT-4o as a `file` content part. The
 * Next.js app renders no page PNGs of its own — lib/vision/renderer.ts is a
 * stub and real page images are produced out-of-band by the GPU worker —
 * so an inline page image is not available at ingestion time.
 *
 * Gated OFF by default: set VISION_OCR_RETRANSCRIBE=true to enable. The
 * re-transcription is best-effort — any failure leaves a page's original
 * OCR text untouched and never blocks ingestion. Forward-only: it runs
 * during ingestion of new uploads, never against existing data.
 */
import OpenAI from 'openai'
import { PDFDocument } from 'pdf-lib'

/** Minimal page shape — structurally satisfied by the ingestion ParsedPage. */
export interface RetranscribePage {
  page_number: number
  text: string
  ocr_confidence?: number
  page_classification?: string | null
}

export interface RetranscribeArgs {
  documentId: string
  /** The source PDF bytes — the same file Document AI OCR'd. */
  pdfBytes: Uint8Array
  /** OCR pages — mutated in place when a page is re-transcribed. */
  pages: RetranscribePage[]
}

export interface RetranscribeResult {
  enabled: boolean
  /** Pages that matched the garbled-handwriting trigger. */
  candidates: number
  /** Pages whose text was actually replaced by a GPT-4o transcription. */
  retranscribed: number
  /** Page numbers that were re-transcribed. */
  pageNumbers: number[]
}

/** Handwritten logbook page classifications — the pages Document AI garbles. */
const HANDWRITTEN_PAGE_CLASSES = new Set([
  'engine_log',
  'airframe_log',
  'prop_log',
  'maintenance_entry',
])

/**
 * GPT-4o transcription is reliable, so a re-transcribed page is given this
 * confidence — high enough that its derived OCR segments clear the 0.86
 * canonical-chunk gate in insertCanonicalChunksFromOcrSegments(). Without
 * this, the clean text would never reach the live retrieval layer.
 */
const RETRANSCRIBED_CONFIDENCE = 0.95

/** Per-document safety cap so a huge binder cannot run an unbounded bill. */
const MAX_RETRANSCRIBE_PAGES = 80

/** Parallel GPT-4o calls. */
const CONCURRENCY = 4

function numEnv(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function isRetranscribeEnabled(): boolean {
  return process.env.VISION_OCR_RETRANSCRIBE === 'true'
}

/**
 * Fraction of alpha tokens that look like OCR garbage. Ported verbatim from
 * scripts/ocr-pilot.mjs so the production trigger matches the metric the
 * pilot measured.
 */
export function gibberishRatio(text: string): number {
  const tokens = (text || '').split(/\s+/).filter((t) => /[a-zA-Z]/.test(t))
  if (tokens.length === 0) return 1
  let bad = 0
  for (const t of tokens) {
    const clean = t.replace(/[^a-zA-Z]/g, '')
    const looksOk =
      clean.length >= 2 &&
      clean.length <= 18 &&
      /[aeiouy]/i.test(clean) &&
      clean.length / t.length > 0.6
    if (!looksOk) bad++
  }
  return bad / tokens.length
}

/**
 * A page is a re-transcription candidate when it is a handwritten logbook
 * page (the classification gate) AND its OCR text looks garbled — low
 * Document AI confidence OR a high gibberish ratio. Thresholds are
 * env-overridable for go-live tuning.
 */
export function isRetranscribeCandidate(page: RetranscribePage): boolean {
  const cls = page.page_classification ?? ''
  if (!HANDWRITTEN_PAGE_CLASSES.has(cls)) return false
  const text = (page.text ?? '').trim()
  if (text.length < 40) return false
  const confThreshold = numEnv('VISION_OCR_CONFIDENCE_THRESHOLD', 0.72)
  const gibThreshold = numEnv('VISION_OCR_GIBBERISH_THRESHOLD', 0.3)
  const lowConfidence =
    typeof page.ocr_confidence === 'number' && page.ocr_confidence < confThreshold
  const garbled = gibberishRatio(text) > gibThreshold
  return lowConfidence || garbled
}

const TRANSCRIBE_PROMPT =
  'This is a scanned page from an aircraft maintenance logbook. Transcribe ALL ' +
  'text on the page as accurately as possible — including handwriting, stamps, ' +
  'dates, tach/Hobbs times, part numbers, signatures and certificate numbers. ' +
  'Preserve numbers exactly. Output only the transcription, with no commentary.'

/** Re-transcribe one page with GPT-4o. Returns clean text, or null on failure. */
async function retranscribeOnePage(
  openai: OpenAI,
  srcPdf: PDFDocument,
  pageIndex: number,
): Promise<string | null> {
  let onePagePdf: Uint8Array
  try {
    const out = await PDFDocument.create()
    const [copied] = await out.copyPages(srcPdf, [pageIndex])
    out.addPage(copied)
    onePagePdf = await out.save()
  } catch (err) {
    console.warn(`[vision-retranscribe] page ${pageIndex} PDF extract failed:`, err)
    return null
  }
  const dataUri = `data:application/pdf;base64,${Buffer.from(onePagePdf).toString('base64')}`
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      max_tokens: 1800,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: TRANSCRIBE_PROMPT },
            { type: 'file', file: { filename: `page_${pageIndex}.pdf`, file_data: dataUri } },
          ],
        },
      ] as unknown as OpenAI.Chat.ChatCompletionMessageParam[],
    })
    const text = (completion.choices?.[0]?.message?.content ?? '').trim()
    return text.length >= 20 ? text : null
  } catch (err) {
    console.warn(`[vision-retranscribe] page ${pageIndex} GPT-4o call failed:`, err)
    return null
  }
}

/**
 * Re-transcribe the garbled handwritten pages of an OCR'd document, mutating
 * `args.pages` in place. No-op (and no API calls) when VISION_OCR_RETRANSCRIBE
 * is not 'true'. Best-effort throughout — it never throws.
 */
export async function retranscribeGarbledPages(
  args: RetranscribeArgs,
): Promise<RetranscribeResult> {
  const disabled: RetranscribeResult = {
    enabled: false,
    candidates: 0,
    retranscribed: 0,
    pageNumbers: [],
  }
  if (!isRetranscribeEnabled()) return disabled

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[vision-retranscribe] OPENAI_API_KEY not set — skipping')
    return { ...disabled, enabled: true }
  }

  const candidates = args.pages.filter(isRetranscribeCandidate)
  if (candidates.length === 0) {
    return { enabled: true, candidates: 0, retranscribed: 0, pageNumbers: [] }
  }

  let srcPdf: PDFDocument
  let pageCount: number
  try {
    srcPdf = await PDFDocument.load(args.pdfBytes, { ignoreEncryption: true })
    pageCount = srcPdf.getPageCount()
  } catch (err) {
    console.warn(`[vision-retranscribe] doc ${args.documentId}: source PDF load failed:`, err)
    return { enabled: true, candidates: candidates.length, retranscribed: 0, pageNumbers: [] }
  }

  // The OCR page_number is the 0-based PDF page index. If any candidate falls
  // outside [0, pageCount) the numbering does not match the PDF — skip the
  // whole document rather than risk transcribing the wrong page.
  if (candidates.some((p) => p.page_number < 0 || p.page_number >= pageCount)) {
    console.warn(
      `[vision-retranscribe] doc ${args.documentId}: OCR page numbers do not align ` +
        `with the ${pageCount}-page PDF — skipping re-transcription for safety`,
    )
    return { enabled: true, candidates: candidates.length, retranscribed: 0, pageNumbers: [] }
  }

  const capped = candidates.slice(0, MAX_RETRANSCRIBE_PAGES)
  if (candidates.length > capped.length) {
    console.warn(
      `[vision-retranscribe] doc ${args.documentId}: ${candidates.length} candidate ` +
        `pages exceeds cap ${MAX_RETRANSCRIBE_PAGES}; re-transcribing the first ${capped.length}`,
    )
  }

  const openai = new OpenAI({ apiKey })
  const pageNumbers: number[] = []
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < capped.length) {
      const page = capped[cursor++]
      const clean = await retranscribeOnePage(openai, srcPdf, page.page_number)
      if (clean) {
        page.text = clean
        page.ocr_confidence = RETRANSCRIBED_CONFIDENCE
        pageNumbers.push(page.page_number)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, capped.length) }, () => worker()),
  )

  pageNumbers.sort((a, b) => a - b)
  return {
    enabled: true,
    candidates: candidates.length,
    retranscribed: pageNumbers.length,
    pageNumbers,
  }
}
