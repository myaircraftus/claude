import { notFound } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { WorkOrderDetailClient } from './work-order-detail-client'
import type { WorkOrder } from '@/types'

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
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Work Orders', href: '/maintenance?tab=work-orders' },
          { label: wo.work_order_number },
        ]}
      />
      <WorkOrderDetailClient
        workOrder={wo as WorkOrder}
        aircraft={aircraft ?? []}
        userRole={membership.role}
      />
    </div>
  )
}
