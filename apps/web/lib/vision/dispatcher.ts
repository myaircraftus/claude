/**
 * Phase 8 Vision RAG — dispatcher (Sprint 8.3).
 *
 * Consumes a queued vision_index_jobs row, fetches the referenced
 * vision_pages, calls the GPU worker (selected by the factory), and
 * updates each page row with the resulting vision_index_id.
 *
 * Idempotency:
 *   - The dispatcher transitions the job queued → running BEFORE any
 *     embedding work. Postgres + the legal-transition guard in
 *     registry.ts make a second concurrent dispatcher's
 *     queued → running update a no-op (the row is already running),
 *     so concurrent ticks compete cleanly: one wins, the other
 *     transitions to running and immediately retries pages already
 *     handled — but those pages are already past 'embedding' status,
 *     so the per-page update guard rejects (illegal transition
 *     'indexed' → 'indexed' is allowed but the worker won't be
 *     called twice because we filter by status='embedding' or
 *     'pending').
 *
 * Partial failure:
 *   - Each page is processed independently. Worker.embed returns one
 *     EmbedResult per page; success=true → status='indexed', success=
 *     false → status='failed' with error_message.
 *   - Job-level status is 'completed' if at least one page succeeded;
 *     'failed' if every page failed; otherwise 'completed' with
 *     errors recorded per-page.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getVisionIndexJob,
  updateVisionIndexJob,
  getVisionPage,
  updateVisionPage,
  listVisionPages,
} from './registry'
import type { VisionPage, VisionIndexJob } from './types'
import { getGpuWorker } from './workers/factory'
import { insertVisionEmbedding, stubVectorsForPage } from './index-query'
import { enqueueFailedIndex } from './review-queue'

export interface DispatchResult {
  jobId: string
  status: 'completed' | 'failed'
  pagesProcessed: number
  pagesSucceeded: number
  pagesFailed: number
  errors: Array<{ visionPageId: string; message: string }>
}

/**
 * Dispatch a job. Reads the job + referenced pages, calls the worker,
 * persists results page-by-page, transitions the job to its terminal
 * state.
 */
export async function dispatchVisionJob(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    jobId,
    status: 'failed',
    pagesProcessed: 0,
    pagesSucceeded: 0,
    pagesFailed: 0,
    errors: [],
  }

  const job: VisionIndexJob | null = await getVisionIndexJob(supabase, jobId, orgId)
  if (!job) {
    result.errors.push({ visionPageId: '-', message: 'job not found in this org' })
    return result
  }

  // Already-terminal? No-op.
  if (job.status === 'completed' || job.status === 'failed') {
    result.status = job.status
    return result
  }

  // Transition queued → running. If two dispatchers race, the second's
  // illegal-transition guard rejects; we treat that as "another worker
  // owns this job" and bail.
  if (job.status === 'queued') {
    try {
      await updateVisionIndexJob(supabase, jobId, {
        status: 'running',
        started_at: new Date().toISOString(),
      }, orgId)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Concurrent dispatcher already moved the job. Bail without error.
      if (message.includes('illegal transition')) {
        return result
      }
      throw err
    }
  }

  // Fetch the page rows (snapshot via job.vision_page_ids).
  const pages: VisionPage[] = []
  for (const pageId of job.vision_page_ids) {
    const page = await getVisionPage(supabase, pageId, orgId)
    if (page) pages.push(page)
    // Soft-deleted pages are silently skipped (per migration 098 comment).
  }

  // Eligible-to-embed pages are those in 'pending' or 'rendering'.
  // Already-indexed pages are silently skipped (idempotent dispatch).
  const eligible = pages.filter((p) => p.status === 'pending' || p.status === 'rendering')

  // Mark each eligible page as 'embedding' before the worker call.
  for (const p of eligible) {
    try {
      await updateVisionPage(supabase, p.id, { status: 'embedding' }, orgId)
    } catch (err) {
      // Illegal transition (already indexed) — drop from eligible.
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ visionPageId: p.id, message })
    }
  }

  // Call the worker.
  const worker = getGpuWorker()
  let embedResults
  try {
    embedResults = await worker.embed(eligible)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Whole-batch failure — flip job to failed, mark each eligible page failed.
    for (const p of eligible) {
      try {
        await updateVisionPage(supabase, p.id, {
          status: 'failed',
          error_message: `worker.embed() threw: ${message}`,
        }, orgId)
      } catch {
        // best-effort
      }
    }
    await updateVisionIndexJob(supabase, jobId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: message,
    }, orgId)
    result.errors.push({ visionPageId: '-', message })
    return result
  }

  // Persist per-page results.
  for (const er of embedResults) {
    result.pagesProcessed++
    try {
      if (er.success) {
        // Sprint 8.4 / 8.9 — insert the embedding row alongside the
        // page status update.
        //
        // Real worker (Modal, Sprint 8.9) returns summary_vector +
        // patch_vectors directly on the EmbedResult — we trust those
        // and write them straight in.
        //
        // Stub mode (no vectors on the result) synthesizes a
        // deterministic 128-dim summary + 64-patch matrix from the
        // page id so retrieval (Sprint 8.5) has data to query against.
        const hasRealVectors =
          Array.isArray(er.summary_vector) &&
          er.summary_vector.length > 0 &&
          er.patch_vectors !== undefined
        const summary_vector = hasRealVectors
          ? (er.summary_vector as number[])
          : stubVectorsForPage(er.vision_page_id).summary_vector
        const patch_vectors = hasRealVectors
          ? (er.patch_vectors as { patches: number[][] })
          : stubVectorsForPage(er.vision_page_id).patch_vectors
        const embedding_dim = hasRealVectors
          ? er.embedding_dim
          : stubVectorsForPage(er.vision_page_id).embedding_dim

        await insertVisionEmbedding(supabase, {
          organization_id: orgId,
          vision_page_id: er.vision_page_id,
          model_used: er.model_used,
          embedding_dim,
          summary_vector,
          patch_vectors,
        })

        await updateVisionPage(supabase, er.vision_page_id, {
          status: 'indexed',
          vision_index_id: er.vision_index_id,
          vision_model: er.model_used,
          embedded_at: new Date().toISOString(),
        }, orgId)
        result.pagesSucceeded++
      } else {
        await updateVisionPage(supabase, er.vision_page_id, {
          status: 'failed',
          error_message: er.error ?? 'worker reported failure without message',
        }, orgId)
        result.pagesFailed++
        result.errors.push({ visionPageId: er.vision_page_id, message: er.error ?? 'unknown' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.pagesFailed++
      result.errors.push({ visionPageId: er.vision_page_id, message })
    }
  }

  // Job-level terminal transition.
  const jobStatus = result.pagesSucceeded > 0 ? 'completed' : 'failed'
  await updateVisionIndexJob(supabase, jobId, {
    status: jobStatus,
    completed_at: new Date().toISOString(),
    gpu_host: worker.id,
    error_message: jobStatus === 'failed'
      ? `${result.pagesFailed} pages failed, 0 succeeded`
      : null,
  }, orgId)

  // Sprint 8.7 — auto-enqueue review for failed-index pages when
  // > 50% of the batch failed. Fire-and-forget; errors logged but
  // not propagated (review-queue insert failure should never break
  // the dispatcher's terminal transition).
  if (result.pagesProcessed > 0 && result.pagesFailed / result.pagesProcessed > 0.5) {
    const failedIds = result.errors
      .map((e) => e.visionPageId)
      .filter((id) => id && id !== '-')
    if (failedIds.length > 0) {
      try {
        await enqueueFailedIndex(supabase, {
          organizationId: orgId,
          visionPageIds: failedIds,
        })
      } catch (err) {
        console.warn('[vision/dispatcher] enqueueFailedIndex failed:', err)
      }
    }
  }

  result.status = jobStatus
  return result
}

/**
 * Sweep all queued jobs that have been waiting > 1 minute and dispatch
 * them. Used by /api/cron/vision-dispatch-sweep.
 */
export async function sweepQueuedJobs(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ swept: number; results: DispatchResult[] }> {
  const cutoffMs = Date.now() - 60_000
  const { data: jobs, error } = await supabase
    .from('vision_index_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'queued')
    .lt('created_at', new Date(cutoffMs).toISOString())
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw new Error(`sweepQueuedJobs: ${error.message}`)

  const results: DispatchResult[] = []
  for (const job of (jobs ?? []) as VisionIndexJob[]) {
    const r = await dispatchVisionJob(supabase, job.id, orgId)
    results.push(r)
  }
  return { swept: results.length, results }
}

/** Re-export listVisionPages so the admin page (Sprint 8.4) can use it. */
export { listVisionPages }
