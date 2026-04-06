import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { MaintenanceEntryClient } from './maintenance-entry-client'
import type { UserProfile, Aircraft } from '@/types'

export const metadata = { title: 'New Maintenance Entry' }

export default async function NewMaintenancePage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, engine_make, engine_model, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const aircraftList: Aircraft[] = (aircraft ?? []) as Aircraft[]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'New Entry' },
        ]}
      />
      <MaintenanceEntryClient aircraftList={aircraftList} />
    </div>
  )
}
