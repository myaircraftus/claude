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

  for (const job of toDispatch) {
    try {
      // For stuck-running jobs, roll any 'embedding' pages back to
      // 'pending' so the Modal direct-mode dispatch will pick them up.
      // (Direct mode filters eligible pages by status='pending'|'rendering'.)
      if (job.kind === 'running') {
        const pageIds = (job as any).vision_page_ids ?? []
        if (pageIds.length > 0) {
          await service
            .from('vision_pages')
            .update({ status: 'pending', error_message: null })
            .in('id', pageIds)
            .eq('status', 'embedding')
        }
        // Reset job back to 'queued' so the dispatcher's queued→running
        // transition succeeds in DIRECT mode.
        await service
          .from('vision_index_jobs')
          .update({ status: 'queued', gpu_host: 'modal', started_at: null })
          .eq('id', (job as any).id)
      } else {
        // Stuck-queued: just mark gpu_host = modal so we know who
        // owned it (audit trail) and dispatch.
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
