import { requireAppServerSession } from '@/lib/auth/server-app'
import { MaintenanceHubClient } from './maintenance-hub-client'

export const metadata = { title: 'Maintenance' }

const VALID_TABS = new Set(['entries', 'work-orders', 'parts', 'workflow'])

export default async function MaintenanceRoute({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { supabase, user, membership } = await requireAppServerSession()
  const orgId = membership.organization_id
  const userRole = membership.role

  const requestedTab = Array.isArray(searchParams?.tab)
    ? searchParams?.tab[0]
    : searchParams?.tab
  const defaultTab = requestedTab && VALID_TABS.has(requestedTab)
    ? requestedTab
    : 'work-orders'

  const selectedAircraftId = Array.isArray(searchParams?.aircraft_id)
    ? searchParams?.aircraft_id[0] ?? null
    : searchParams?.aircraft_id ?? null

  const [
    aircraftRes,
    draftsRes,
    workOrdersRes,
    membersRes,
    invoicesRes,
    pendingRequestsRes,
    partOrdersRes,
  ] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .order('tail_number', { ascending: true }),
    supabase
      .from('maintenance_entry_drafts')
      .select(`
        id,
        aircraft_id,
        entry_type,
        status,
        ai_generated_text,
        edited_text,
        created_at,
        updated_at,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('work_orders')
      .select(`
        id,
        work_order_number,
        status,
        service_type,
        customer_complaint:complaint,
        discrepancy,
        corrective_action,
        findings,
        internal_notes,
        customer_notes:customer_visible_notes,
        labor_total,
        parts_total,
        outside_services_total,
        tax_amount,
        total:total_amount,
        opened_at,
        closed_at,
        created_at,
        updated_at,
        aircraft_id,
        customer_id,
        assigned_mechanic_id,
        thread_id,
        aircraft:aircraft_id (id, tail_number, make, model),
        customer:customer_id (id, name, company, email)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('organization_memberships')
      .select(`
        id,
        role,
        permissions,
        accepted_at,
        user_profiles:user_id (id, full_name, email, avatar_url, job_title)
      `)
      .eq('organization_id', orgId)
      .not('accepted_at', 'is', null)
      .order('role', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, balance_due, created_at, aircraft_id, customer_id')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('maintenance_requests')
      .select('id, status, aircraft_id, target_mechanic_user_id, created_at')
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('part_order_records')
      .select(`
        id,
        status,
        quantity,
        unit_price,
        total_price,
        currency,
        vendor_name,
        vendor_url,
        selected_part_number,
        selected_title,
        selected_condition,
        selected_image_url,
        aircraft_id,
        work_order_id,
        created_at,
        updated_at,
        aircraft:aircraft_id (id, tail_number)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const aircraft = (aircraftRes.data ?? []) as any[]
  const drafts = (draftsRes.data ?? []) as any[]
  const workOrders = (workOrdersRes.data ?? []) as any[]
  const members = (membersRes.data ?? []) as any[]
  const invoices = (invoicesRes.data ?? []) as any[]
  const pendingRequests = (pendingRequestsRes.data ?? []) as any[]
  const orders = (partOrdersRes.data ?? []) as any[]

  const workOrderStats = {
    open: workOrders.filter((wo) => wo.status === 'open').length,
    in_progress: workOrders.filter((wo) => wo.status === 'in_progress').length,
    ready_for_signoff: workOrders.filter((wo) => wo.status === 'ready_for_signoff').length,
    total: workOrders.length,
  }

  const partsStats = {
    total: orders.length,
    ordered: orders.filter((order) => ['ordered', 'shipping', 'received_partial'].includes(order.status)).length,
    received: orders.filter((order) => order.status === 'received').length,
    spend: orders.reduce((sum, order) => sum + Number(order.total_price ?? 0), 0),
  }

  return (
    <MaintenanceHubClient
      orgId={orgId}
      userRole={userRole}
      currentUserId={user.id}
      aircraft={aircraft}
      defaultTab={defaultTab}
      drafts={drafts}
      selectedAircraftId={selectedAircraftId}
      workOrders={workOrders}
      workOrderStats={workOrderStats}
      orders={orders}
      partsStats={partsStats}
      members={members}
      opsWorkOrders={workOrders}
      invoices={invoices}
      pendingRequests={pendingRequests}
    />
  )
}
