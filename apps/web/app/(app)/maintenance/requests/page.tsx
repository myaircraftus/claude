import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { RequestsList } from './requests-list'

export const metadata = { title: 'Maintenance Requests' }

export default async function MaintenanceRequestsPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const role = membership.role

  // Fetch maintenance requests with joins
  let query = supabase
    .from('maintenance_requests')
    .select(`
      id, aircraft_id, requester_user_id, target_mechanic_user_id,
      message, squawk_ids, status, created_work_order_id,
      created_at, responded_at,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model)
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(100)

  // Mechanics see requests targeted at them
  if (role === 'mechanic') {
    query = query.eq('target_mechanic_user_id', user.id)
  } else if (role === 'pilot') {
    query = query.eq('requester_user_id', user.id)
  }

  const { data: requests } = await query

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Maintenance', href: '/maintenance' },
          { label: 'Requests' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <RequestsList
            initialRequests={(requests ?? []).map((r: any) => ({
              ...r,
              requester: Array.isArray(r.requester) ? r.requester[0] ?? null : r.requester ?? null,
              mechanic: Array.isArray(r.mechanic) ? r.mechanic[0] ?? null : r.mechanic ?? null,
              aircraft: Array.isArray(r.aircraft) ? r.aircraft[0] ?? null : r.aircraft ?? null,
            }))}
            currentUserRole={role}
          />
        </div>
      </main>
    </div>
  )
}
