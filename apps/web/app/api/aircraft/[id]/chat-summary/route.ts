/**
 * GET /api/aircraft/[id]/chat-summary
 *
 * Drives the floating chat-bubble drawer. For one aircraft, returns:
 *   - aircraft tail + make/model
 *   - the list of work orders (open ones first), each with status, totals,
 *     hours logged, and the thread_id
 *   - the most recent squawks tied to the aircraft
 *   - the most recent estimate tied to the aircraft (so the bubble can show
 *     "Estimate $X — pending approval")
 *
 * The chat bubble UI then renders messages for the selected work order's
 * thread via the existing /api/work-orders/[id]/messages endpoint.
 *
 * Single source of truth: every signal is derived from the existing tables
 * (work_orders / squawks / estimates) — no new state.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

const OPEN_WO_STATUSES = ['open', 'in_progress', 'awaiting_parts', 'awaiting_approval', 'waiting_customer', 'ready_for_signoff']

export async function GET(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const aircraftId = params.id

  const { data: aircraft } = await service
    .from('aircraft')
    .select('id, tail_number, make, model, year')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  // Work orders for this aircraft (open first, then closed by recency)
  const { data: workOrders } = await service
    .from('work_orders')
    .select(`
      id, work_order_number, status, service_type, customer_complaint, discrepancy,
      labor_total, parts_total, outside_services_total, total, opened_at, closed_at,
      assigned_mechanic_id, thread_id, customer_id, linked_invoice_id,
      labor_lines:work_order_lines(id, description, hours, rate, total)
    `)
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', aircraftId)
    .order('opened_at', { ascending: false })
    .limit(20)

  // Squawks for the timeline (open + recently resolved)
  const { data: squawks } = await service
    .from('squawks')
    .select('id, title, description, severity, status, reported_at, resolved_at, created_at')
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', aircraftId)
    .order('created_at', { ascending: false })
    .limit(15)

  // Most recent estimate (so the bubble header shows "Estimate $X pending")
  const { data: estimates } = await service
    .from('estimates')
    .select('id, estimate_number, status, total, created_at, valid_until, customer_notes, linked_work_order_id')
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', aircraftId)
    .order('created_at', { ascending: false })
    .limit(5)

  // Compute hours-logged + sort: open work orders first
  const wos = (workOrders ?? []).map((wo: any) => {
    const lines = Array.isArray(wo.labor_lines) ? wo.labor_lines : []
    const hoursLogged = lines.reduce((acc: number, l: any) => acc + (Number(l.hours) || 0), 0)
    return {
      id: wo.id,
      work_order_number: wo.work_order_number,
      status: wo.status,
      service_type: wo.service_type,
      customer_complaint: wo.customer_complaint,
      discrepancy: wo.discrepancy,
      labor_total: wo.labor_total ?? 0,
      parts_total: wo.parts_total ?? 0,
      outside_services_total: wo.outside_services_total ?? 0,
      total: wo.total ?? 0,
      hours_logged: Math.round(hoursLogged * 10) / 10,
      opened_at: wo.opened_at,
      closed_at: wo.closed_at,
      thread_id: wo.thread_id,
      customer_id: wo.customer_id,
      linked_invoice_id: wo.linked_invoice_id,
      is_open: OPEN_WO_STATUSES.includes(String(wo.status ?? '').toLowerCase()),
    }
  })
  wos.sort((a: { is_open: boolean; opened_at: string | null }, b: { is_open: boolean; opened_at: string | null }) => {
    if (a.is_open && !b.is_open) return -1
    if (!a.is_open && b.is_open) return 1
    return (b.opened_at ?? '').localeCompare(a.opened_at ?? '')
  })

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
