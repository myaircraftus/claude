/**
 * /admin/billing/batch — Phase 14 Sprint 14.5 admin batch dashboard.
 *
 * Shows queue counts by status × gpu_host, oldest scheduled_for, total
 * pages waiting, modal-cost estimate, and a "run now" button per tier.
 *
 * Auth: /admin layout already gates is_platform_admin.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { BatchPanel } from './batch-panel-client'

export const metadata = { title: 'Billing — Batch Queue · Admin' }
export const dynamic = 'force-dynamic'

export default async function BatchAdminPage() {
  const service = createServiceSupabase()
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
        if (!oldestScheduled || j.scheduled_for < oldestScheduled) oldestScheduled = j.scheduled_for
      }
    }
    if (status === 'completed' && j.completed_at) {
      if (!newestCompleted || j.completed_at > newestCompleted) newestCompleted = j.completed_at
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-bold">Batch Queue</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Pending and in-flight vision-index jobs grouped by status and worker host.
      </p>
      <BatchPanel
        initialByStatus={byStatus}
        queuedTotalPages={queuedTotalPages}
        oldestScheduledFor={oldestScheduled}
        newestCompletedAt={newestCompleted}
      />
    </div>
  )
}
