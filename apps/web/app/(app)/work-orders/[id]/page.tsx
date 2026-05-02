import { notFound } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { WorkOrderDetailClient } from './work-order-detail-client'
import type { WorkOrder } from '@/types'

// Right pane of the master-detail layout. The page chrome (Topbar + WO list
// panel) is owned by app/(app)/work-orders/layout.tsx — this component
// just renders the WO detail itself.
export default async function WorkOrderDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: wo } = await supabase
    .from('work_orders')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      lines:work_order_lines (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) notFound()

  // Sort lines by sort_order
  if (wo.lines) {
    (wo.lines as any[]).sort((a, b) => a.sort_order - b.sort_order)
  }

  // Fetch aircraft list for reassignment
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  return (
    <WorkOrderDetailClient
      workOrder={wo as WorkOrder}
      aircraft={aircraft ?? []}
      userRole={membership.role}
      profile={profile as any}
    />
  )
}
