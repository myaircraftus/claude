import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { MaintenanceHub } from '@/components/maintenance/MaintenanceHub'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Maintenance' }

export default async function MaintenancePage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  if (!membershipRes.data) redirect('/onboarding')
  const membership = membershipRes.data as any
  const orgId = membership.organization_id

  const [aircraftRes, membersRes] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),
    supabase
      .from('organization_memberships')
      .select('user_id, role, user_profiles(full_name, email)')
      .eq('organization_id', orgId)
      .not('accepted_at', 'is', null),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profileRes.data as UserProfile}
        breadcrumbs={[{ label: 'Maintenance' }]}
      />
      <MaintenanceHub
        organizationId={orgId}
        userRole={membership.role}
        userId={user.id}
        aircraft={aircraftRes.data ?? []}
        members={(membersRes.data ?? []).map((m: any) => ({
          id: m.user_id,
          name: m.user_profiles?.full_name ?? m.user_profiles?.email ?? 'Unknown',
          role: m.role,
        }))}
      />
    </div>
  )
}
