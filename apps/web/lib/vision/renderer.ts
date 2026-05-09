/**
 * Phase 8 Vision RAG — page renderer (Sprint 8.2).
 *
 * For a given source document:
 *   1. Read the source PDF from the OCR pipeline's `documents` bucket
 *      (READ-ONLY — sacred boundary).
 *   2. Use pdf-lib (already in deps via lib/ingestion/native-pdf) to
 *      count pages WITHOUT a canvas binding. This works headless.
 *   3. For each page, insert a vision_pages row with status='rendering'.
 *   4. Render the page to PNG @ 200dpi and upload to the vision-pages
 *      bucket. ⚠ FOUNDATION GAP: real PNG rendering needs a canvas
 *      binding (pdfjs-dist + node-canvas / @napi-rs/canvas). Neither
 *      is installable in this batch (HARD STOP rule 3 — no runtime
 *      deps). The current implementation marks pages as 'pending'
 *      without uploading bytes; a future sprint or a separate
 *      GPU/worker process does the rasterization.
 *   5. Update each vision_pages row: status='rendering' → 'pending'
 *      on success (rendered, ready for embedding). On error: 'failed'.
 *
 * Concurrency:
 *   - Pages within one document are processed in serial.
 *   - Multiple documents can call this in parallel (one waitUntil per).
 */
import { PDFDocument } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createVisionPage,
  updateVisionPage,
  listVisionPages,
} from './registry'
import { buildVisionPagePath, uploadPageImage, VISION_PAGES_BUCKET } from './storage'
import type { VisionPage } from './types'

/** Render-mode flag. Real rendering requires a canvas binding (see file header). */
export type RenderMode = 'stub' | 'real'

export const RENDER_MODE: RenderMode = 'stub'

/** Tracks the canvas-binding gap surfaced by HARD STOP rule 3. */
export const RENDERER_LIMITATION_NOTE =
  'Foundation stub — rasterization to PNG requires pdfjs-dist + canvas binding ' +
  'which is not installable in this batch. vision_pages rows are created with ' +
  'status=pending and the would-be storage path; actual PNG bytes will be ' +
  'uploaded in a future sprint that has the GPU worker / canvas dependency.'

export interface RenderRequest {
  organizationId: string
  sourceDocumentId: string
  /** Path of the source PDF in the `documents` bucket. */
  sourceFilePath: string
  /** If true, re-render even if vision_pages already exist for this doc. */
  force?: boolean
}

export interface RenderResult {
  organizationId: string
  sourceDocumentId: string
  pageCount: number
  /** Pages newly inserted into vision_pages this call. */
  pagesCreated: number
  /** Pages that already existed and were left alone (unless force=true). */
  pagesSkipped: number
  /** Pages that errored during create or render. */
  pagesFailed: number
  errors: Array<{ pageNumber: number; message: string }>
}

/**
 * Pull the PDF bytes from the sacred `documents` bucket — READ ONLY.
 * The OCR pipeline owns that bucket; we never write to it.
 */
async function downloadSourcePdf(
  supabase: SupabaseClient,
  sourceFilePath: string,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from('documents')
    .download(sourceFilePath)
  if (error || !data) {
    throw new Error(`downloadSourcePdf(${sourceFilePath}): ${error?.message ?? 'no data'}`)
  }
  const buf = await data.arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * Count PDF pages using pdf-lib. Headless — no canvas needed.
 * Throws on malformed PDF input.
 */
async function countPdfPages(pdfBytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

/**
 * STUB rasterization. Returns a 1x1 transparent PNG byte sequence so
 * uploadPageImage() doesn't choke if a caller passes through; in
 * practice we DO NOT call uploadPageImage from the stub-mode renderer
 * (we set status=pending without uploading).
 *
 * Real implementation (future sprint):
 *   - Load doc with pdfjs-dist
 *   - getPage(n+1).render({ canvasContext, viewport })
 *   - Convert canvas → PNG buffer at 200dpi
 *
 * 1×1 transparent PNG (constant bytes — verified at the byte level).
 */
const STUB_PNG_1X1_TRANSPARENT = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, // IDAT
  0x54, 0x08, 0x99, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND
  0x42, 0x60, 0x82,
])

export function getStubPng(): Uint8Array {
  return STUB_PNG_1X1_TRANSPARENT
}

/**
 * Main entry point. Idempotent w.r.t. force=false: a second call for
 * the same document is a no-op (every page already exists).
 */
export async function renderDocumentToPages(
  supabase: SupabaseClient,
  req: RenderRequest,
): Promise<RenderResult> {
  const result: RenderResult = {
    organizationId: req.organizationId,
    sourceDocumentId: req.sourceDocumentId,
    pageCount: 0,
    pagesCreated: 0,
    pagesSkipped: 0,
    pagesFailed: 0,
    errors: [],
  }

  // 1. Download source PDF (read-only, from sacred 'documents' bucket).
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await downloadSourcePdf(supabase, req.sourceFilePath)
  } catch (err) {
    result.errors.push({ pageNumber: -1, message: err instanceof Error ? err.message : String(err) })
    return result
  }

  // 2. Count pages.
  let pageCount: number
  try {
    pageCount = await countPdfPages(pdfBytes)
    result.pageCount = pageCount
  } catch (err) {
    result.errors.push({ pageNumber: -1, message: err instanceof Error ? err.message : String(err) })
    return result
  }

  // 3. Existing pages for this doc (idempotency check).
  const existing = await listVisionPages(supabase, req.organizationId, {
    source_document_id: req.sourceDocumentId,
  })
  const existingByPage = new Map<number, VisionPage>(
    existing.map((p) => [p.page_number, p]),
  )

  // 4. Per-page processing — serial within a doc, can parallelize across docs.
  for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
    if (existingByPage.has(pageIdx) && !req.force) {
      result.pagesSkipped++
      continue
    }

    const path = buildVisionPagePath({
      organizationId: req.organizationId,
      sourceDocumentId: req.sourceDocumentId,
      pageNumber: pageIdx,
    })

    try {
      // Insert at status='rendering' so the registry reflects in-progress state.
      const inserted = await createVisionPage(supabase, {
        organization_id: req.organizationId,
        source_document_id: req.sourceDocumentId,
        page_number: pageIdx,
        page_image_path: path,
        status: 'rendering',
      })

      if (RENDER_MODE === 'stub') {
        // Foundation gap — see RENDERER_LIMITATION_NOTE. We mark the
        // page as 'pending' (rendered, awaiting embed) WITHOUT uploading
        // real PNG bytes. The dispatcher (Sprint 8.3) is also stubbed
        // and doesn't actually fetch the image.
        await updateVisionPage(supabase, inserted.id, {
          status: 'pending',
          rendered_at: new Date().toISOString(),
        }, req.organizationId)
      } else {
        // Real path (future). Render → upload → mark pending.
        const png = getStubPng() // placeholder — TODO: replace with pdfjs-dist render
        await uploadPageImage(supabase, {
          organizationId: req.organizationId,
          sourceDocumentId: req.sourceDocumentId,
          pageNumber: pageIdx,
          pngBytes: png,
        })
        await updateVisionPage(supabase, inserted.id, {
          status: 'pending',
          rendered_at: new Date().toISOString(),
        }, req.organizationId)
      }

      result.pagesCreated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.pagesFailed++
      result.errors.push({ pageNumber: pageIdx, message })
      // Best-effort: mark the row as failed if it was inserted.
      const failedRow = existingByPage.get(pageIdx)
      if (failedRow) {
        try {
          await updateVisionPage(supabase, failedRow.id, {
            status: 'failed',
            error_message: message,
          }, req.organizationId)
        } catch {
          // already in error state — swallow
        }
      }
    }
  }

  return result
}

/** Re-export the bucket name so /api/vision/render can include it in diagnostics. */
export { VISION_PAGES_BUCKET }
