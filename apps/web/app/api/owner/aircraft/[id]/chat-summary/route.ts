/**
 * GET /api/owner/aircraft/[id]/chat-summary
 *
 * Owner-side mirror of /api/aircraft/[id]/chat-summary. Returns the same
 * shape so the WorkOrderChatBubble can render with no code-path
 * differences — the only swap is the URL.
 *
 * Auth: portal-customer ownership chain (customers.portal_user_id =
 * auth.uid()). The aircraft must be owned by one of the calling user's
 * customer rows; otherwise 404. Service-role reads beyond that — RLS
 * would block direct access since the owner is not in the shop's org.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOwnerContext } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'

const OPEN_WO_STATUSES = [
  'open',
  'in_progress',
  'awaiting_parts',
  'awaiting_approval',
  'waiting_customer',
  'ready_for_signoff',
]

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()

  // Confirm the aircraft is owned by one of the calling user's customers.
  const { data: aircraft } = await service
    .from('aircraft')
    .select('id, tail_number, make, model, year, owner_customer_id, organization_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  if (!aircraft.owner_customer_id || !ctx.customerIds.includes(aircraft.owner_customer_id)) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  const aircraftOrgId = aircraft.organization_id

  // Owner-visible work orders for this aircraft. Same query shape as the
  // shop endpoint; org scoping comes from the aircraft itself.
  const { data: workOrders } = await service
    .from('work_orders')
    .select(`
      id, work_order_number, status, service_type, complaint, discrepancy,
      labor_total, parts_total, outside_services_total, total_amount,
      opened_at, closed_at, assigned_mechanic_id, thread_id, linked_invoice_id,
      labor_lines:work_order_lines(id, description, hours, rate, line_total)
    `)
    .eq('organization_id', aircraftOrgId)
    .eq('aircraft_id', params.id)
    .order('opened_at', { ascending: false })
    .limit(20)

  const { data: squawks } = await service
    .from('squawks')
    .select('id, title, description, severity, status, reported_at, resolved_at, created_at')
    .eq('organization_id', aircraftOrgId)
    .eq('aircraft_id', params.id)
    .order('created_at', { ascending: false })
    .limit(15)

  const { data: estimates } = await service
    .from('estimates')
    .select('id, estimate_number, status, total, created_at, valid_until, customer_notes, linked_work_order_id')
    .eq('organization_id', aircraftOrgId)
    .eq('aircraft_id', params.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const wos = (workOrders ?? []).map((wo: any) => {
    const lines = Array.isArray(wo.labor_lines) ? wo.labor_lines : []
    const hoursLogged = lines.reduce((acc: number, l: any) => acc + (Number(l.hours) || 0), 0)
    return {
      id: wo.id,
      work_order_number: wo.work_order_number,
      status: wo.status,
      service_type: wo.service_type,
      customer_complaint: wo.complaint,
      discrepancy: wo.discrepancy,
      labor_total: Number(wo.labor_total ?? 0),
      parts_total: Number(wo.parts_total ?? 0),
      outside_services_total: Number(wo.outside_services_total ?? 0),
      total: Number(wo.total_amount ?? 0),
      hours_logged: Math.round(hoursLogged * 10) / 10,
      opened_at: wo.opened_at,
      closed_at: wo.closed_at,
      thread_id: wo.thread_id,
      customer_id: null,
      linked_invoice_id: wo.linked_invoice_id,
      is_open: OPEN_WO_STATUSES.includes(String(wo.status ?? '').toLowerCase()),
    }
  })
  wos.sort(
    (
      a: { is_open: boolean; opened_at: string | null },
      b: { is_open: boolean; opened_at: string | null },
    ) => {
      if (a.is_open && !b.is_open) return -1
      if (!a.is_open && b.is_open) return 1
      return (b.opened_at ?? '').localeCompare(a.opened_at ?? '')
    },
  )

  return NextResponse.json({
    aircraft: {
      id: aircraft.id,
      tail_number: aircraft.tail_number,
      make: aircraft.make,
      model: aircraft.model,
      year: aircraft.year,
    },
    work_orders: wos,
    squawks: squawks ?? [],
    estimates: estimates ?? [],
  })
}
