/**
 * Phase 12 follow-up — render detection for the Modal fallback path.
 *
 * The auto-dispatch helper from Phase 12 (lib/vision/auto-dispatch.ts)
 * creates `vision_pages` rows with paths in the canonical
 * `${org}/${doc}/page_${N}.png` format but does NOT upload the actual
 * PNGs. The Colab queue worker handles this naturally — it downloads
 * the parent PDF and rasterizes inline. The Modal `/embed` endpoint
 * does NOT — it expects the PNG to already exist in storage and
 * fails with a "signed url" error otherwise.
 *
 * Two detectors:
 *
 *   1. `needsRendering(pages)` — sync, path-pattern only.
 *      Catches null/empty/non-canonical paths. Returns true for
 *      anything that doesn't look like a real path. Conservative:
 *      mixed → true.
 *
 *   2. `probePageImageExists(supabase, page)` — async, storage HEAD.
 *      Authoritative: returns false if the bucket doesn't actually
 *      contain the file at the given path. This is the signal that
 *      catches Phase 12 auto-dispatch placeholders (which have valid-
 *      looking paths but no uploaded PNG).
 *
 * The fallback cron uses both: if `needsRendering(pages)` is true OR
 * the first page fails the storage probe, route to `/backfill`
 * instead of `/embed`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VisionPage } from './types'
import { VISION_PAGES_BUCKET } from './storage'

/**
 * Canonical real-path regex. Must:
 *   - start with a UUID-looking org segment
 *   - then a UUID-looking doc segment
 *   - then `page_<digits>.png`
 *
 * The renderer uses unpadded `page_${n}.png` (not zero-padded — see
 * actual production data 2026-05-09). Both padded and unpadded match.
 */
const CANONICAL_PATH_RE = /^[0-9a-f-]{32,}\/[0-9a-f-]{32,}\/page_\d+\.png$/i

/**
 * Sync, path-pattern only. Returns true if ANY page in the list lacks
 * a canonical-looking path. Empty array returns false (nothing to render).
 *
 * NB: this CANNOT detect the Phase 12 auto-dispatch case where paths
 * look canonical but the PNGs aren't actually uploaded. Use
 * `probePageImageExists` for that case.
 */
export function needsRendering(pages: VisionPage[]): boolean {
  if (pages.length === 0) return false
  for (const p of pages) {
    if (!p.page_image_path) return true
    if (!CANONICAL_PATH_RE.test(p.page_image_path)) return true
  }
  return false
}

/**
 * Async, authoritative. Probes storage for the existence of a single
 * page's PNG. Returns true if the file is in the bucket.
 *
 * Uses `createSignedUrl` as a HEAD-equivalent: signing succeeds even if
 * the file doesn't exist, so we follow up with a HEAD fetch. If the
 * fetch returns 200 the file exists; 404 (or any non-2xx) means it
 * doesn't.
 *
 * Caller should probe the FIRST page of a job (page_number=0) — if
 * that doesn't exist, the rest probably don't either, and we save N-1
 * round trips.
 */
export async function probePageImageExists(
  supabase: SupabaseClient,
  page: VisionPage,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  if (!page.page_image_path) return false
  try {
    const { data, error } = await supabase.storage
      .from(VISION_PAGES_BUCKET)
      .createSignedUrl(page.page_image_path, 60)
    if (error || !data?.signedUrl) return false
    const res = await fetchFn(data.signedUrl, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}
