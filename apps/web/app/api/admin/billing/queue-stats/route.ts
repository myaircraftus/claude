/**
 * GET /api/admin/billing/queue-stats — Phase 14 Sprint 14.5
 *
 * Returns the data the /admin/billing/batch dashboard needs:
 *   - count of queued/running/completed/failed jobs by gpu_host
 *   - oldest scheduled_for (when the next batch window opens)
 *   - total pages waiting in the queue
 *   - last batch run window (last completed job's completed_at)
 *
 * Auth: is_platform_admin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()

  // Status × gpu_host breakdown
  const { data: jobs } = await service
    .from('vision_index_jobs')
    .select('id, status, gpu_host, scheduled_for, vision_page_ids, completed_at')
  const byStatus: Record<string, Record<string, number>> = {}
  let queuedTotalPages = 0
  let oldestScheduled: string | null = null
  let newestCompleted: string | null = null

  for (const j of (jobs as any[]) ?? []) {
    const status = j.status as string
    const host = (j.gpu_host as string) ?? 'null'
    if (!byStatus[status]) byStatus[status] = {}
    byStatus[status][host] = (byStatus[status][host] ?? 0) + 1
    if (status === 'queued') {
      queuedTotalPages += (j.vision_page_ids?.length ?? 0)
      if (j.scheduled_for) {
        if (!oldestScheduled || j.scheduled_for < oldestScheduled) {
          oldestScheduled = j.scheduled_for
        }
      }
    }
    if (status === 'completed' && j.completed_at) {
      if (!newestCompleted || j.completed_at > newestCompleted) {
        newestCompleted = j.completed_at
      }
    }
  }

  // Cost estimator: rough Modal cost per page
  // (Modal ~A10G runs at $0.0003/sec; ColQwen2 takes ~3-5s per page →
  // call it $0.0015/page on Modal. Colab is flat $10/mo.)
  const modalCostEstimate = queuedTotalPages * 0.0015

  return NextResponse.json({
    by_status: byStatus,
    queued_total_pages: queuedTotalPages,
    oldest_scheduled_for: oldestScheduled,
    newest_completed_at: newestCompleted,
    modal_cost_estimate_usd: Number(modalCostEstimate.toFixed(2)),
  })
}
