import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { SchedulerView } from './scheduler-view'

export const metadata = { title: 'Scheduler' }

/**
 * /scheduler — Mechanic Scheduler entry route (Spec 2.5.1).
 *
 * Server component pulls org membership list (so the assignee picker
 * has names + ids without an extra round-trip), then hands off to the
 * client SchedulerView for tab switching + calendar / form rendering.
 *
 * Shifts and shift_covers are fetched client-side on tab activation so
 * the URL can carry tab + month state cheaply.
 */
export default async function SchedulerPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: members } = await supabase
    .from('organization_memberships')
    .select(`
      user_id,
      role,
      user_profiles:user_id (id, full_name, email)
    `)
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const techs = ((members ?? []) as any[])
    .map((m) => {
      const p = Array.isArray(m.user_profiles) ? m.user_profiles[0] : m.user_profiles
      if (!p?.id) return null
      return {
        id: m.user_id as string,
        full_name: (p?.full_name ?? p?.email ?? 'Unknown') as string,
        role: (m.role ?? 'mechanic') as string,
      }
    })
    .filter((x): x is { id: string; full_name: string; role: string } => x !== null)

  const isAdmin = ['owner', 'admin'].includes(membership.role)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Scheduler' }]} />
      <main className="flex-1 overflow-hidden">
        <SchedulerView
          techs={techs}
          currentUserId={profile.id}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  )
}
