/**
 * Phase 8 Vision RAG — storage helpers (Sprint 8.2).
 *
 * Wraps the `vision-pages` Supabase storage bucket. Path convention:
 *   ${organization_id}/${source_document_id}/page_${page_number}.png
 *
 * The bucket itself must exist before these functions are called. Andy
 * creates it via the Supabase dashboard or CLI:
 *   supabase storage create vision-pages --public=false
 *
 * The OCR/RAG pipeline uses a separate `documents` bucket — confirmed
 * via read-only inspection of apps/web/lib/ingestion/server.ts:547
 * (`storage.from('documents').createSignedUrl(...)`). The two buckets
 * must remain SEPARATE; this module never touches `documents`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const VISION_PAGES_BUCKET = 'vision-pages'

/**
 * Build the canonical storage path for a vision page. Pure function —
 * no side effects, deterministic, used by both the renderer (write
 * side) and the dispatcher (read side) so they agree on layout.
 */
export function buildVisionPagePath(args: {
  organizationId: string
  sourceDocumentId: string
  pageNumber: number
}): string {
  const { organizationId, sourceDocumentId, pageNumber } = args
  // Zero-pad to 4 digits so lexicographic sorting matches numeric.
  const pageStr = String(pageNumber).padStart(4, '0')
  return `${organizationId}/${sourceDocumentId}/page_${pageStr}.png`
}

/**
 * Upload a rendered PNG for a single vision page. Returns the storage
 * path. Caller is responsible for setting the corresponding
 * vision_pages.page_image_path AFTER this resolves.
 *
 * Uses upsert: false — re-rendering a page should go through a
 * deliberate delete-then-render cycle, not a silent overwrite.
 */
export async function uploadPageImage(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    sourceDocumentId: string
    pageNumber: number
    pngBytes: Uint8Array
  },
): Promise<{ path: string }> {
  const path = buildVisionPagePath(args)
  const { error } = await supabase.storage
    .from(VISION_PAGES_BUCKET)
    .upload(path, args.pngBytes, {
      contentType: 'image/png',
      upsert: false,
    })
  if (error) throw new Error(`uploadPageImage(${path}): ${error.message}`)
  return { path }
}

/**
 * Signed read URL for the page image. Used by the dispatcher when
 * sending the image to a GPU service that needs an HTTP-fetchable
 * source.
 *
 * Default TTL of 3600s mirrors the OCR pipeline's signed-URL pattern
 * (apps/web/lib/ingestion/server.ts:547).
 */
export async function getPageImageUrl(
  supabase: SupabaseClient,
  path: string,
  ttlSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(VISION_PAGES_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) {
    throw new Error(`getPageImageUrl(${path}): ${error?.message ?? 'no signed URL'}`)
  }
  return data.signedUrl
}

/**
 * Delete every page image for a given source document. Used when a
 * document is retired or when re-rendering a doc from scratch.
 *
 * Does NOT delete the corresponding vision_pages rows — that's the
 * registry's job. Callers should sequence: deletePageImages() →
 * softDeleteVisionPage() per page.
 */
export async function deletePageImagesForDocument(
  supabase: SupabaseClient,
  args: { organizationId: string; sourceDocumentId: string },
): Promise<{ deletedCount: number }> {
  const prefix = `${args.organizationId}/${args.sourceDocumentId}/`
  const { data: list, error: listErr } = await supabase.storage
    .from(VISION_PAGES_BUCKET)
    .list(prefix.slice(0, -1)) // trailing slash isn't part of the prefix arg
  if (listErr) throw new Error(`deletePageImages(list): ${listErr.message}`)
  if (!list || list.length === 0) return { deletedCount: 0 }

  const paths = list.map((f) => `${prefix}${f.name}`)
  const { error: rmErr } = await supabase.storage
    .from(VISION_PAGES_BUCKET)
    .remove(paths)
  if (rmErr) throw new Error(`deletePageImages(remove): ${rmErr.message}`)
  return { deletedCount: paths.length }
}
