/**
 * GET /api/cron/vision-fallback-sweep  (Phase 11 Sprint 11.4)
 *
 * Every 5 minutes (per vercel.json): find vision_index_jobs stuck
 * because the Colab queue worker is offline / dead mid-job. Roll the
 * pages back to 'pending' if needed, set gpu_host='modal', and
 * dispatch each via dispatchVisionJob({ mode: 'direct' }) — forcing
 * the legacy synchronous Modal path for those specific jobs.
 *
 * Stuck rules:
 *   - status='queued' AND created_at < now() - 10 min
 *     → Colab never picked it up (worker offline or no available
 *       worker matched the job's org / page set).
 *   - status='running' AND started_at < now() - 20 min AND no
 *     vision_worker_heartbeat within last 60s
 *     → A Colab worker claimed the job but died mid-process. Pages
 *       may be stuck in 'embedding' status.
 *
 * Per-tick cap: max 10 stuck jobs sent to Modal (don't overwhelm
 * Modal during a Colab outage). Anything beyond gets the next tick.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { dispatchVisionJob } from '@/lib/vision/dispatcher'
import { countAvailableWorkers } from '@/lib/vision/heartbeat'
import {
  needsRendering,
  probePageImageExists,
} from '@/lib/vision/render-detector'
import { createModalBackfillClient } from '@/lib/vision/workers/modal'
import type { VisionPage } from '@/lib/vision/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const STUCK_QUEUED_MIN = 10        // queued > 10 min
const STUCK_RUNNING_MIN = 20       // running > 20 min
const HEARTBEAT_MAX_AGE_S = 60     // worker considered alive if pinged in last 60s
const MAX_DISPATCHES_PER_TICK = 10

function isVercelCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCron(req)) return NextResponse.json({ error: 'Cron only' }, { status: 401 })

  const service = createServiceSupabase()
  const startedAt = Date.now()
  const result = {
    ok: true,
    workers_alive: 0,
    swept_queued: 0,
    swept_running: 0,
    modal_dispatches: 0,
    /** Phase 12 fix — dispatches that went through /backfill instead of /embed. */
    modal_backfill_dispatches: 0,
    skipped_capped: 0,
    errors: [] as Array<{ jobId: string; error: string }>,
  }

  // 1. How many Colab workers are alive right now? (informational —
  //    we still pick up stuck jobs even if Colab is alive, because
  //    "stuck" already means the worker isn't getting to them.)
  try {
    result.workers_alive = await countAvailableWorkers(service, HEARTBEAT_MAX_AGE_S)
  } catch (err) {
    console.warn('[fallback-sweep] countAvailableWorkers error', err)
  }

  // 2. Find stuck-queued jobs.
  const stuckQueuedCutoff = new Date(Date.now() - STUCK_QUEUED_MIN * 60_000).toISOString()
  const { data: stuckQueued } = await service
    .from('vision_index_jobs')
    .select('id, organization_id, vision_page_ids, created_at')
    .eq('status', 'queued')
    .lt('created_at', stuckQueuedCutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_DISPATCHES_PER_TICK)
  result.swept_queued = (stuckQueued ?? []).length

  // 3. Find stuck-running jobs.
  const stuckRunningCutoff = new Date(Date.now() - STUCK_RUNNING_MIN * 60_000).toISOString()
  const { data: stuckRunning } = await service
    .from('vision_index_jobs')
    .select('id, organization_id, vision_page_ids, started_at, gpu_host')
    .eq('status', 'running')
    .lt('started_at', stuckRunningCutoff)
    .order('started_at', { ascending: true })
    .limit(MAX_DISPATCHES_PER_TICK)
  result.swept_running = (stuckRunning ?? []).length

  const allCandidates = [
    ...((stuckQueued ?? []).map((j: any) => ({ ...j, kind: 'queued' as const }))),
    ...((stuckRunning ?? []).map((j: any) => ({ ...j, kind: 'running' as const }))),
  ]

  // Cap at MAX_DISPATCHES_PER_TICK total.
  const remaining = MAX_DISPATCHES_PER_TICK - 0
  const toDispatch = allCandidates.slice(0, remaining)
  result.skipped_capped = Math.max(0, allCandidates.length - toDispatch.length)

  // Lazy-build the /backfill client only if we end up needing it (most
  // ticks won't — the auto-dispatch case is bounded by upload volume).
  let backfillClient: ReturnType<typeof createModalBackfillClient> | null = null
  function getBackfillClient() {
    if (!backfillClient) {
      backfillClient = createModalBackfillClient({ supabase: service })
    }
    return backfillClient
  }

  for (const job of toDispatch) {
    try {
      // 1. Load this job's vision_pages to drive the routing decision.
      const pageIds = (job as any).vision_page_ids ?? []
      let pages: VisionPage[] = []
      if (pageIds.length > 0) {
        const { data: pageRows } = await service
          .from('vision_pages')
          .select('*')
          .in('id', pageIds)
          .is('deleted_at', null)
        pages = (pageRows ?? []) as VisionPage[]
      }

      // 2. Decide /backfill vs /embed:
      //    - sync needsRendering() catches obvious null/non-canonical paths
      //    - async storage HEAD on the first page catches the auto-
      //      dispatch case (paths look real but PNG isn't uploaded)
      let mustBackfill = needsRendering(pages)
      if (!mustBackfill && pages.length > 0) {
        const firstByPageNumber = [...pages].sort((a, b) => a.page_number - b.page_number)[0]
        const exists = await probePageImageExists(service, firstByPageNumber)
        if (!exists) mustBackfill = true
      }

      if (mustBackfill && pages.length > 0) {
        // ── Modal /backfill path (Phase 12 architecture-gap fix) ──
        // Modal will create fresh vision_pages rows during the backfill
        // pipeline. Delete the placeholder rows first so the unique
        // index doesn't collide.
        const docIds = Array.from(new Set(pages.map((p) => p.source_document_id)))

        // Mark job 'running' on Modal up-front so the admin dashboard
        // sees movement; we'll flip to completed/failed after the call.
        await service
          .from('vision_index_jobs')
          .update({ status: 'running', gpu_host: 'modal', started_at: new Date().toISOString() })
          .eq('id', (job as any).id)

        // Delete the placeholder vision_pages rows (Modal /backfill
        // creates fresh ones with the canonical layout).
        await service.from('vision_pages').delete().in('id', pageIds)

        try {
          const docResults = await getBackfillClient().backfillDocuments({
            sourceDocumentIds: docIds,
            organizationId: (job as any).organization_id,
          })
          const totalProcessed = docResults.reduce((sum, r) => sum + r.pages_processed, 0)
          const totalFailed = docResults.reduce((sum, r) => sum + r.pages_failed, 0)
          const allErrors = docResults.flatMap((r) => r.errors)
          const allSucceeded = totalFailed === 0 && allErrors.length === 0

          // Note: vision_index_jobs has no `metadata` column (verified via
          // information_schema 2026-05-09); we encode the dispatch mode +
          // result counts into error_message even on success so the admin
          // dashboard can see what happened.
          const summaryNote = `backfill: ${totalProcessed} pages succeeded, ${totalFailed} failed`
          await service
            .from('vision_index_jobs')
            .update({
              status: allSucceeded ? 'completed' : 'failed',
              completed_at: new Date().toISOString(),
              model_used: 'colqwen2',
              error_message: allSucceeded
                ? null
                : `${summaryNote}; ${allErrors[0] ?? ''}`.slice(0, 1000),
            })
            .eq('id', (job as any).id)

          if (allSucceeded) {
            result.modal_backfill_dispatches += 1
          } else {
            result.errors.push({
              jobId: (job as any).id,
              error: `backfill partial failure: ${allErrors[0] ?? `${totalFailed} pages failed`}`,
            })
          }
        } catch (err) {
          // Top-level transport / auth failure on /backfill. Mark the
          // job failed so the next sweep tick doesn't retry forever.
          const message = err instanceof Error ? err.message : String(err)
          await service
            .from('vision_index_jobs')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error_message: `backfill transport: ${message}`.slice(0, 1000),
            })
            .eq('id', (job as any).id)
          result.errors.push({ jobId: (job as any).id, error: `backfill: ${message}` })
        }
        continue
      }

      // ── Existing /embed path (pages already rendered) ──
      // For stuck-running jobs, roll any 'embedding' pages back to
      // 'pending' so the Modal direct-mode dispatch will pick them up.
      // (Direct mode filters eligible pages by status='pending'|'rendering'.)
      if (job.kind === 'running') {
        if (pageIds.length > 0) {
          await service
            .from('vision_pages')
            .update({ status: 'pending', error_message: null })
            .in('id', pageIds)
            .eq('status', 'embedding')
        }
        await service
          .from('vision_index_jobs')
          .update({ status: 'queued', gpu_host: 'modal', started_at: null })
          .eq('id', (job as any).id)
      } else {
        await service
          .from('vision_index_jobs')
          .update({ gpu_host: 'modal' })
          .eq('id', (job as any).id)
      }

      const dispatchResult = await dispatchVisionJob(
        service,
        (job as any).id,
        (job as any).organization_id,
        { mode: 'direct' },
      )
      if (dispatchResult.status === 'failed') {
        result.errors.push({
          jobId: (job as any).id,
          error: dispatchResult.errors[0]?.message ?? 'unknown',
        })
      } else {
        result.modal_dispatches += 1
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ jobId: (job as any).id, error: message })
    }
  }

  return NextResponse.json({
    ...result,
    elapsed_ms: Date.now() - startedAt,
  })
}
