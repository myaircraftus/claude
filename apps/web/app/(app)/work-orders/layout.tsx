import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { WorkOrdersShell, type WorkOrderListItem, type ShellAircraft } from './work-orders-shell'

/**
 * Layout for both /work-orders (no selection) and /work-orders/[id]
 * (selected). The list of WOs is fetched once here and the right
 * panel is rendered as `children` — so navigating between WOs
 * doesn't refetch the list and doesn't reset scroll.
 */
export default async function WorkOrdersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Phase 18 Sprint 18.4 — shop/admin-only WO tree (closes Phase 15 F2)
  const guard = await requirePersona(['shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const [woRes, acRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select(`
        id,
        work_order_number,
        status,
        complaint,
        total_amount,
        opened_at,
        created_at,
        updated_at,
        aircraft_id,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .eq('organization_id', orgId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false })
      .limit(300),
    supabase
      .from('aircraft')
      .select('id, tail_number')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),
  ])

  const workOrdersRaw = (woRes.data ?? []) as any[]
  const workOrders: WorkOrderListItem[] = workOrdersRaw.map((wo) => ({
    id: wo.id,
    work_order_number: wo.work_order_number,
    status: wo.status,
    customer_complaint: wo.complaint ?? null,
    total_amount: typeof wo.total_amount === 'number' ? wo.total_amount : Number(wo.total_amount ?? 0),
    opened_at: wo.opened_at,
    created_at: wo.created_at,
    updated_at: wo.updated_at,
    aircraft_id: wo.aircraft_id,
    aircraft: Array.isArray(wo.aircraft) ? wo.aircraft[0] : wo.aircraft,
  }))
  const aircraft = (acRes.data ?? []) as ShellAircraft[]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Work Orders' }]} />
      <main className="flex-1 overflow-hidden">
        <WorkOrdersShell workOrders={workOrders} aircraft={aircraft}>
          {children}
        </WorkOrdersShell>
      </main>
    </div>
  )
}
