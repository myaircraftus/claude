import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { CustomerDetail } from './customer-detail'
import { ThreadPanel } from '@/components/portal/thread-panel'

export default async function CustomerDetailPage({
  params,
}: {
  params: { id: string }
}) {
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

  // Fetch customer with aircraft assignments
  const { data: customer } = await supabase
    .from('customers')
    .select(`
      id, name, company, email, phone, secondary_email, secondary_phone,
      billing_address, notes, preferred_contact, tags, portal_access,
      imported_at, import_source, created_at, updated_at,
      aircraft_customer_assignments (
        id, aircraft_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number, make, model)
      )
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!customer) notFound()

  // Fetch recent work orders
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, customer_complaint, total, opened_at, created_at,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', orgId)
    .eq('customer_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch invoice count + total
  const { data: invoiceData } = await supabase
    .from('work_orders')
    .select('total')
    .eq('organization_id', orgId)
    .eq('customer_id', params.id)
    .in('status', ['invoiced', 'paid'])

  const invoiceCount = invoiceData?.length ?? 0
  const invoiceTotal = invoiceData?.reduce((sum, wo) => sum + (wo.total ?? 0), 0) ?? 0

  // Fetch all org aircraft for the assign dropdown
  const { data: orgAircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Customers', href: '/customers' },
          { label: customer.name },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <CustomerDetail
            customer={{
              ...customer,
              aircraft_customer_assignments: (customer.aircraft_customer_assignments ?? []).map((a: any) => ({
                ...a,
                aircraft: Array.isArray(a.aircraft) ? a.aircraft[0] ?? null : a.aircraft ?? null,
              })),
            }}
            workOrders={(workOrders ?? []).map((wo: any) => ({
              ...wo,
              aircraft: Array.isArray(wo.aircraft) ? wo.aircraft[0] ?? null : wo.aircraft ?? null,
            }))}
            invoiceCount={invoiceCount}
            invoiceTotal={invoiceTotal}
            orgAircraft={orgAircraft ?? []}
          />
          <ThreadPanel
            apiBase="/api"
            customerId={customer.id}
            viewerRole="mechanic"
            heading={`Messages with ${customer.name}`}
          />
        </div>
      </main>
    </div>
  )
}
