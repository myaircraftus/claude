import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { CustomersList } from './customers-list'

export const metadata = { title: 'Customers' }

export default async function CustomersPage() {
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
  if (!profile || !membershipRes.data) redirect('/login')

  const orgId = membershipRes.data.organization_id

  // Fetch customers with aircraft assignments
  const { data: customers } = await supabase
    .from('customers')
    .select(`
      id, name, company, email, phone, tags, portal_access, created_at,
      aircraft_customer_assignments (
        id, aircraft_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number)
      )
    `)
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(100)

  // Compute stats
  const allCustomers = customers ?? []
  const stats = {
    total: allCustomers.length,
    withAircraft: allCustomers.filter(
      (c: any) => c.aircraft_customer_assignments && c.aircraft_customer_assignments.length > 0
    ).length,
    withPortal: allCustomers.filter((c: any) => c.portal_access).length,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Customers' }]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <CustomersList customers={allCustomers.map((c: any) => ({
            ...c,
            aircraft_customer_assignments: (c.aircraft_customer_assignments ?? []).map((a: any) => ({
              ...a,
              aircraft: Array.isArray(a.aircraft) ? a.aircraft[0] ?? null : a.aircraft ?? null,
            })),
          }))} stats={stats} />
        </div>
      </main>
    </div>
  )
}
