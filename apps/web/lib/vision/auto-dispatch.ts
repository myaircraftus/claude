/**
 * Phase 12 Task B — auto-dispatch new docs into the vision queue.
 *
 * Called fire-and-forget from lib/ingestion/server.ts when a document
 * finishes OCR/RAG ingestion. Skipped entirely unless
 * VISION_AUTO_DISPATCH=true (env-flag default OFF so existing
 * pipelines aren't surprised).
 *
 * Idempotent: if any vision_pages already exist for the document,
 * we skip (no double-enqueue). The Phase 11 Colab queue worker will
 * pick the resulting vision_index_jobs row up via its poll loop.
 *
 * Why we materialize vision_pages here instead of letting the worker
 * do it: the dispatcher contract (Sprint 8.3) is page-id-driven, and
 * keeping the queue layer agnostic of doc → page expansion lets the
 * worker process arbitrary page subsets later (e.g. a re-embed job
 * for one specific page).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgTier, getAircraftTier } from '@/lib/billing/tier-service'
import { computeScheduledFor } from './dispatch-scheduler'
import type { TierSlug } from '@/lib/billing/pricing-config'

export interface AutoDispatchInput {
  /** The document that just finished ingestion. */
  documentId: string
  organizationId: string
  /** Page count from documents.page_count (post-OCR). Required. */
  pageCount: number
  /**
   * Optional aircraft id. When set, the dispatcher resolves the
   * effective tier via getAircraftTier (which honors the per-aircraft
   * override). When null/undefined, falls back to the org's tier.
   */
  aircraftId?: string | null
}

export interface AutoDispatchResult {
  enqueued: boolean
  jobId?: string
  reason?: 'flag_off' | 'no_pages' | 'already_dispatched' | 'inserted'
}

export const VISION_AUTO_DISPATCH_ENV = 'VISION_AUTO_DISPATCH'

/** Read the feature flag. Returns true only when env value is exactly 'true' (case-insensitive). */
export function autoDispatchEnabled(envOverride?: string): boolean {
  const value = (envOverride ?? process.env[VISION_AUTO_DISPATCH_ENV] ?? '').toLowerCase()
  return value === 'true'
}

/**
 * Enqueue the document for vision embedding via the Phase 11 queue.
 *
 * Behavior:
 *   - Returns { enqueued: false, reason: 'flag_off' } when the env flag isn't set.
 *   - Returns { enqueued: false, reason: 'no_pages' } when pageCount <= 0.
 *   - Returns { enqueued: false, reason: 'already_dispatched' } when ANY
 *     vision_pages exist for this doc (idempotent — re-ingestion won't
 *     double-enqueue).
 *   - Otherwise creates pageCount vision_pages rows (status='pending')
 *     and one vision_index_jobs row (status='queued') referencing them.
 *     Returns { enqueued: true, jobId, reason: 'inserted' }.
 *
 * Throws on supabase errors so the caller's catch can log without
 * propagating to the user request.
 */
export async function enqueueDocumentForVision(
  supabase: SupabaseClient,
  input: AutoDispatchInput,
  envOverride?: string,
): Promise<AutoDispatchResult> {
  if (!autoDispatchEnabled(envOverride)) {
    return { enqueued: false, reason: 'flag_off' }
  }
  if (input.pageCount <= 0) {
    return { enqueued: false, reason: 'no_pages' }
  }

  // Idempotency: skip if any vision_pages exist for this doc.
  const { data: existing } = await supabase
    .from('vision_pages')
    .select('id')
    .eq('source_document_id', input.documentId)
    .is('deleted_at', null)
    .limit(1)
  if (existing && existing.length > 0) {
    return { enqueued: false, reason: 'already_dispatched' }
  }

  // Create vision_pages rows with status='pending'. The page_image_path
  // is set to the path the worker will use after it rasterizes the PDF
  // on its side — the path itself isn't critical for the job (the
  // worker rebuilds images from the parent PDF) but the unique index
  // and downstream code expects a non-null value.
  const pagesPayload = Array.from({ length: input.pageCount }, (_, n) => ({
    organization_id: input.organizationId,
    source_document_id: input.documentId,
    page_number: n,
    page_image_path: `${input.organizationId}/${input.documentId}/page_${n}.png`,
    status: 'pending' as const,
  }))

  const { data: insertedPages, error: pageErr } = await supabase
    .from('vision_pages')
    .insert(pagesPayload)
    .select('id')
  if (pageErr) {
    // 23505 = duplicate key; unlikely given our pre-check, but if a
    // concurrent enqueue raced us, treat as already_dispatched.
    if (pageErr.code === '23505' || /duplicate/i.test(pageErr.message)) {
      return { enqueued: false, reason: 'already_dispatched' }
    }
    throw new Error(`enqueueDocumentForVision: page insert failed: ${pageErr.message}`)
  }

  const visionPageIds = (insertedPages ?? []).map((r: any) => r.id)
  if (visionPageIds.length === 0) {
    throw new Error('enqueueDocumentForVision: pages inserted but no IDs returned')
  }

  // Resolve the effective tier (Phase 14). Aircraft override > org tier;
  // org's tier_billing_disabled kill-switch collapses to beta if set.
  // We swallow tier-lookup errors to fail-safe to beta — never break
  // ingestion because of a tier resolution bug.
  let effectiveTier: TierSlug = 'beta'
  try {
    if (input.aircraftId) {
      effectiveTier = await getAircraftTier(supabase, input.aircraftId)
    } else {
      effectiveTier = await getOrgTier(supabase, input.organizationId)
    }
  } catch (err) {
    console.warn('[auto-dispatch] tier resolution failed, defaulting to beta:', err)
  }

  // Tier + page-count → scheduled_for. Pro/Beta + small doc = NOW();
  // Standard or any-tier + >200 pages = next 02:00 UTC.
  const scheduledFor = computeScheduledFor(effectiveTier, input.pageCount)

  // Create the vision_index_jobs row. status='queued' is what the
  // Colab queue worker polls for.
  const { data: job, error: jobErr } = await supabase
    .from('vision_index_jobs')
    .insert({
      organization_id: input.organizationId,
      vision_page_ids: visionPageIds,
      status: 'queued',
      scheduled_for: scheduledFor,
      // gpu_host left null — whichever worker claims it fills this in.
    })
    .select('id')
    .single()
  if (jobErr || !job) {
    throw new Error(`enqueueDocumentForVision: job insert failed: ${jobErr?.message ?? 'no row returned'}`)
  }

  return { enqueued: true, jobId: job.id, reason: 'inserted' }
}
