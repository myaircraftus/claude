// Workforce — Shift Scheduler. Weekly calendar backed by the shifts table;
// each accepted org member is a roster row, their shifts render as blocks.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { SchedulerClient } from './scheduler-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Shift Scheduler' }

export default async function SchedulerPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  // Most recent ~200 shifts — the client windows them to the visible week.
  const { data: shifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', orgId)
    .order('start_time', { ascending: false })
    .limit(200)

  // Roster: accepted org members → user_profiles for display names.
  const { data: members } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean)
  const { data: userProfiles } = userIds.length
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const roster = (userProfiles ?? []).map((u) => ({
    user_id: u.id,
    name: u.full_name?.trim() || u.email || 'Unknown member',
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Scheduler' }]} />
      <main className="flex-1 overflow-hidden">
        <SchedulerClient
          shifts={(shifts ?? []) as any[]}
          roster={roster}
        />
      </main>
    </div>
  )
}
