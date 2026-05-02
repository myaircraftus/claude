import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ClockView } from './clock-view'

export const metadata = { title: 'Clock In/Out' }

/**
 * /clock — daily clock in/out admin view (Spec 2.5.3).
 *
 * Admin sees everyone's events; tech sees own (the API enforces the
 * scope=mine fallback when no admin role + no explicit employee_id).
 */
export default async function ClockPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id
  const isAdmin = ['owner', 'admin'].includes(membership.role)

  const { data: members } = await supabase
    .from('organization_memberships')
    .select(`user_id, role, user_profiles:user_id (id, full_name, email)`)
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Clock In/Out' }]} />
      <main className="flex-1 overflow-hidden">
        <ClockView team={team} currentUserId={profile.id} isAdmin={isAdmin} />
      </main>
    </div>
  )
}
