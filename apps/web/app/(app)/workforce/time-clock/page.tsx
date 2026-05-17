// Time Clock — daily shift punch board. Backed by the clock_events table;
// a mechanic is "Clocked In" when they have a clock_event today with a null
// clock_out_at. Roster is drawn from accepted organization memberships.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TimeClockClient } from './time-clock-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Time Clock' }

export default async function TimeClockPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  // Start of today (local) as an ISO timestamp for the clock_in_at filter.
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayStartISO = todayStart.toISOString()

  const { data: events } = await supabase
    .from('clock_events')
    .select('*')
    .eq('organization_id', orgId)
    .gte('clock_in_at', todayStartISO)
    .order('clock_in_at', { ascending: false })

  // Mechanic roster — accepted memberships joined to their profiles.
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const userIds = Array.from(
    new Set((memberships ?? []).map((m) => m.user_id as string).filter(Boolean)),
  )

  const { data: ppl } = userIds.length
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    : { data: [] }

  const roster = (ppl ?? [])
    .map((p) => ({
      user_id: p.id as string,
      name: (p.full_name as string)?.trim() || (p.email as string) || 'Unknown',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Time Clock' }]} />
      <main className="flex-1 overflow-hidden">
        <TimeClockClient roster={roster} events={(events ?? []) as any[]} />
      </main>
    </div>
  )
}
