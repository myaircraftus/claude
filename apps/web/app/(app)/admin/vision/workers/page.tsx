/**
 * /(app)/admin/vision/workers  (Phase 11 Sprint 11.4)
 *
 * Live view of vision worker heartbeats + stuck-job counts. Owner/admin
 * only. The page renders server-side at request time; the client
 * component below auto-refreshes every 30s.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { WorkersDashboard } from './workers-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Vision Workers (Admin)' }

export default async function AdminVisionWorkersPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) redirect('/login')
  if (!['owner', 'admin'].includes(membership.role)) redirect('/')

  const service = createServiceSupabase()

  // Heartbeats — most recent first
  const { data: heartbeats } = await service
    .from('vision_worker_heartbeat')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(50)

  // Job-status histogram
  const { data: jobs } = await service
    .from('vision_index_jobs')
    .select('status, gpu_host, created_at, started_at')
    .order('created_at', { ascending: false })
    .limit(500)

  // Stuck-job counts (mirrors the cron's thresholds)
  const now = Date.now()
  const stuckQueued = (jobs ?? []).filter((j: any) =>
    j.status === 'queued' && new Date(j.created_at).getTime() < now - 10 * 60 * 1000,
  ).length
  const stuckRunning = (jobs ?? []).filter((j: any) =>
    j.status === 'running' &&
    j.started_at &&
    new Date(j.started_at).getTime() < now - 20 * 60 * 1000,
  ).length

  // Status histogram
  const statusCounts: Record<string, number> = {}
  for (const j of (jobs ?? []) as any[]) {
    statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1
  }

  // Recent fallback dispatches (gpu_host='modal' jobs in last 24h)
  const recentFallbacks = ((jobs ?? []) as any[])
    .filter((j) => j.gpu_host === 'modal')
    .slice(0, 10)

  const profileForTopbar = {
    id: user.id,
    email: user.email ?? '',
    full_name: profile?.full_name ?? user.email ?? '',
    avatar_url: null,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profileForTopbar as any}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Vision Index', href: '/admin/vision' },
          { label: 'Workers' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-6xl mx-auto w-full space-y-6">
        <WorkersDashboard
          heartbeats={(heartbeats ?? []) as any[]}
          jobStatusCounts={statusCounts}
          stuckQueued={stuckQueued}
          stuckRunning={stuckRunning}
          recentFallbacks={recentFallbacks}
        />
      </main>
    </div>
  )
}
