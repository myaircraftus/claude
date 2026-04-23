import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { toDbWorkOrderStatus } from '@/lib/work-orders/status'

async function recalculateTotals(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createServerSupabase>,
  workOrderId: string
) {
  const { data: lines } = await supabase
    .from('work_order_lines')
    .select('line_type, line_total')
    .eq('work_order_id', workOrderId)

  const labor_total = (lines ?? [])
    .filter(l => l.line_type === 'labor')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const parts_total = (lines ?? [])
    .filter(l => l.line_type === 'part')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const outside_services_total = (lines ?? [])
    .filter(l => l.line_type === 'outside_service')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const total = labor_total + parts_total + outside_services_total

  await supabase
    .from('work_orders')
    .update({ labor_total, parts_total, outside_services_total, total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      customer_complaint:complaint,
      customer_notes:customer_visible_notes,
      total:total_amount,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      lines:work_order_lines (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sort lines by sort_order
  if (data.lines) {
    data.lines.sort((a: any, b: any) => a.sort_order - b.sort_order)
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()
  const allowedFields = [
    'status', 'complaint', 'discrepancy', 'troubleshooting_notes', 'findings',
    'corrective_action', 'internal_notes', 'customer_visible_notes',
    'assigned_mechanic_id', 'aircraft_id', 'customer_id', 'tax_amount', 'service_type',
    'linked_invoice_id', 'linked_logbook_entry_id',
    'closed_at',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  // Map frontend field names to DB column names
  if ('customer_complaint' in body) body.complaint = body.customer_complaint
  if ('complaint' in body) body.complaint = body.complaint
  if ('customer_notes' in body) body.customer_visible_notes = body.customer_notes
  if ('customer_visible_notes' in body) body.customer_visible_notes = body.customer_visible_notes
  if ('status' in body) body.status = toDbWorkOrderStatus(body.status)
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  if (body.status === 'closed') {
    const { data: incompleteChecklist, error: checklistError } = await supabase
      .from('work_order_checklist_items')
      .select('id')
      .eq('organization_id', orgId)
      .eq('work_order_id', params.id)
      .eq('required', true)
      .eq('completed', false)

    if (checklistError) {
      return NextResponse.json({ error: checklistError.message }, { status: 500 })
    }

    if ((incompleteChecklist?.length ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Complete all required checklist items before closing this work order.' },
        { status: 409 }
      )
    }
  }

  // Auto-set timestamps based on status
  if (body.status === 'closed' && !updates.closed_at) updates.closed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('work_orders')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Only allow deleting draft or archived work orders
  const { data: wo } = await supabase
    .from('work_orders')
    .select('status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['draft', 'archived'].includes(wo.status)) {
    return NextResponse.json({ error: 'Only draft or archived work orders can be deleted' }, { status: 409 })
  }

  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
