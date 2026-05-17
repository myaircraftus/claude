// Time Off Requests (Spec 2.5.2). Backed by the time_off_requests table;
// employee_id is resolved to a name via the org's accepted memberships.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TimeOffClient } from './time-off-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Time Off Requests' }

export default async function TimeOffPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: requests } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500)

  // Resolve the mechanic roster: accepted org members → user_profiles.
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const userIds = Array.from(
    new Set((memberships ?? []).map((m) => m.user_id).filter(Boolean) as string[]),
  )

  const { data: profiles } = userIds.length
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const roster = (profiles ?? []).map((p) => ({
    user_id: p.id as string,
    name: (p.full_name as string | null)?.trim() || (p.email as string | null) || 'Unknown',
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Time Off' }]} />
      <main className="flex-1 overflow-hidden">
        <TimeOffClient requests={(requests ?? []) as any[]} roster={roster} />
      </main>
    </div>
  )
}
