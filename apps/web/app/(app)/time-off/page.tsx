import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TimeOffView } from './time-off-view'

export const metadata = { title: 'Time Off' }

/**
 * /time-off — Time Off Requests entry route (Spec 2.5.2).
 *
 * Server-side fetches the org's member roster so the form can populate
 * notify_user_ids + the approval queue can label rows by employee name
 * without an extra round-trip per row.
 */
export default async function TimeOffPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: members } = await supabase
    .from('organization_memberships')
    .select(`
      user_id, role,
      user_profiles:user_id (id, full_name, email)
    `)
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)

  const team = ((members ?? []) as any[])
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
      <Topbar profile={profile} breadcrumbs={[{ label: 'Time Off' }]} />
      <main className="flex-1 overflow-hidden">
        <TimeOffView
          team={team}
          currentUserId={profile.id}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  )
}
