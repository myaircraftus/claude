import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { MyAircraftClient } from './my-aircraft-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'My Aircraft' }

export default async function MyAircraftPage() {
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
  if (!profile || !membershipRes.data) redirect('/onboarding')

  const orgId = membershipRes.data.organization_id
  const role = membershipRes.data.role

  // Determine which aircraft the user can see
  // Pilots see aircraft assigned to them via customer link, or all if they're org staff
  let aircraftIds: string[] = []

  if (['owner', 'admin', 'mechanic'].includes(role)) {
    // Staff roles see all aircraft
    const { data: allAircraft } = await supabase
      .from('aircraft')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
    aircraftIds = (allAircraft ?? []).map((a: any) => a.id)
  } else {
    // Pilot/viewer: find via customer assignments linked to user
    // First find customers linked to this user (where customer email matches user email)
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .eq('organization_id', orgId)
      .eq('email', profile.email)

    if (customers && customers.length > 0) {
      const customerIds = customers.map((c: any) => c.id)
      const { data: assignments } = await supabase
        .from('aircraft_customer_assignments')
        .select('aircraft_id')
        .eq('organization_id', orgId)
        .in('customer_id', customerIds)
      aircraftIds = (assignments ?? []).map((a: any) => a.aircraft_id)
    }

    // Also include aircraft where owner_customer_id matches
    if (customers && customers.length > 0) {
      const customerIds = customers.map((c: any) => c.id)
      const { data: ownedAircraft } = await supabase
        .from('aircraft')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_archived', false)
        .in('owner_customer_id', customerIds)
      const ownedIds = (ownedAircraft ?? []).map((a: any) => a.id)
      aircraftIds = [...new Set([...aircraftIds, ...ownedIds])]
    }
  }

  if (aircraftIds.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar
          profile={profile}
          breadcrumbs={[{ label: 'My Aircraft' }]}
        />
        <MyAircraftClient aircraft={[]} squawkCounts={{}} workOrdersByAircraft={{}} invoices={[]} />
      </div>
    )
  }

  // Fetch aircraft details
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, base_airport, total_time_hours')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .in('id', aircraftIds)
    .order('tail_number')

  // Fetch squawk counts per aircraft
  const { data: squawks } = await supabase
    .from('squawks')
    .select('id, aircraft_id, status')
    .eq('organization_id', orgId)
    .in('aircraft_id', aircraftIds)
    .in('status', ['open', 'in_progress', 'deferred'])

  const squawkCounts: Record<string, number> = {}
  for (const s of squawks ?? []) {
    squawkCounts[s.aircraft_id] = (squawkCounts[s.aircraft_id] ?? 0) + 1
  }

  // Fetch open work orders per aircraft
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select('id, work_order_number, aircraft_id, status, created_at, updated_at')
    .eq('organization_id', orgId)
    .in('aircraft_id', aircraftIds)
    .not('status', 'in', '("closed","archived","paid")')
    .order('updated_at', { ascending: false })
    .limit(100)

  const workOrdersByAircraft: Record<string, any[]> = {}
  for (const wo of workOrders ?? []) {
    if (!workOrdersByAircraft[wo.aircraft_id]) workOrdersByAircraft[wo.aircraft_id] = []
    workOrdersByAircraft[wo.aircraft_id].push(wo)
  }

  // Fetch unpaid invoices for these aircraft
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, aircraft_id, status, total, balance_due, due_date, created_at')
    .eq('organization_id', orgId)
    .in('aircraft_id', aircraftIds)
    .not('status', 'in', '("paid","void","writeoff")')
    .order('due_date', { ascending: true })
    .limit(100)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'My Aircraft' }]}
      />
      <MyAircraftClient
        aircraft={(aircraft ?? []) as any}
        squawkCounts={squawkCounts}
        workOrdersByAircraft={workOrdersByAircraft}
        invoices={(invoices ?? []) as any}
      />
    </div>
  )
}
