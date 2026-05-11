import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { WorkOrderDetailClient } from './work-order-detail-client'
import type { WorkOrder } from '@/types'

// NOTE: Phase 18 Sprint 18.4 — the shop/admin persona guard is enforced by
// app/(app)/work-orders/layout.tsx, which Next renders BEFORE this page.
// We don't repeat the guard here (and especially not in generateMetadata,
// which fires for tab titles and would cause an unwanted redirect).

// Per-WO tab title so users can distinguish multiple WO tabs in their browser.
// Falls back to a generic "Work Order" if the lookup fails (e.g. cross-org
// access attempt) — the page itself will then render notFound().
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const { supabase, membership } = await requireAppServerSession()
    const { data } = await supabase
      .from('work_orders')
      .select('wo_number, aircraft:aircraft_id(tail_number)')
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!data?.wo_number) return { title: 'Work Order | myaircraft.us' }
    const tail = (Array.isArray(data.aircraft) ? data.aircraft[0]?.tail_number : (data.aircraft as { tail_number?: string } | null)?.tail_number) ?? null
    const tailSegment = tail ? ` · ${tail}` : ''
    return { title: `${data.wo_number}${tailSegment} | myaircraft.us` }
  } catch {
    return { title: 'Work Order | myaircraft.us' }
  }
}

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
