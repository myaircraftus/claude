/**
 * GET /api/cron/vision-batch-trigger  (Phase 14 Sprint 14.3)
 *
 * Runs at 02:00 UTC daily (per vercel.json schedule). The actual work
 * happens organically — every Standard-tier job's scheduled_for is set
 * to the next 02:00 UTC at upload time, so when this cron fires the
 * queue worker (Colab) and the fallback cron will both see them as
 * "ready to claim" naturally.
 *
 * This endpoint exists as:
 *   1. A heartbeat: confirms the batch window opened on schedule
 *   2. An audit log: counts how many jobs were eligible at the moment
 *      the batch window opened (for capacity planning)
 *   3. A safety net: a future iteration could explicitly poke the
 *      queue worker or pre-warm Modal here, but v1 doesn't.
 *
 * Auth: same vercel-cron + Bearer CRON_SECRET pattern as the other
 * cron routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  const nowIso = new Date().toISOString()

  // Count queued jobs whose scheduled_for has just become reachable
  // (i.e. the batch window contains them).
  const { count: readyCount } = await service
    .from('vision_index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso)

  // Count jobs that are still scheduled in the future (next batch).
  const { count: pendingCount } = await service
    .from('vision_index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .gt('scheduled_for', nowIso)

  // Count distribution by gpu_host of currently running jobs.
  const { data: runningRows } = await service
    .from('vision_index_jobs')
    .select('gpu_host')
    .eq('status', 'running')
  const runningByHost: Record<string, number> = {}
  for (const r of (runningRows as any[]) ?? []) {
    const host = r.gpu_host ?? 'null'
    runningByHost[host] = (runningByHost[host] ?? 0) + 1
  }

  console.log(
    `[batch-trigger] ${nowIso} — ready=${readyCount ?? 0} pending=${pendingCount ?? 0} running=${JSON.stringify(runningByHost)}`,
  )

  return NextResponse.json({
    ok: true,
    triggered_at: nowIso,
    ready_jobs: readyCount ?? 0,
    pending_future_jobs: pendingCount ?? 0,
    running_by_host: runningByHost,
    note: 'No work performed directly — Colab queue worker + fallback sweep handle dispatch organically once scheduled_for becomes reachable.',
    elapsed_ms: Date.now() - startedAt,
  })
}
