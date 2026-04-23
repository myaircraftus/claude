import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { ADMIN_AND_ABOVE } from '@/lib/roles'
import { createServerSupabase } from '@/lib/supabase/server'

type ApprovalAction = 'approve' | 'reject'

function isApprovalAction(value: unknown): value is ApprovalAction {
  return value === 'approve' || value === 'reject'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req, { includeOrganization: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_AND_ABOVE.includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action
  if (!isApprovalAction(action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: workOrder, error: fetchError } = await supabase
    .from('work_orders')
    .select('id, work_order_number, status, customer_visible_notes')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !workOrder) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  if (!['awaiting_approval', 'waiting_on_customer', 'open'].includes(workOrder.status)) {
    return NextResponse.json(
      { error: `Work order cannot be updated from status "${workOrder.status}"` },
      { status: 409 }
    )
  }

  const status = action === 'approve' ? 'open' : 'waiting_on_customer'
  const ownerNotes = typeof body.notes === 'string' ? body.notes.trim() : ''
  const notePrefix = action === 'approve' ? 'Owner approved work order.' : 'Owner requested changes.'
  const nextCustomerNotes = ownerNotes
    ? `${workOrder.customer_visible_notes ? `${workOrder.customer_visible_notes}\n\n` : ''}${notePrefix} ${ownerNotes}`
    : action === 'reject'
      ? `${workOrder.customer_visible_notes ? `${workOrder.customer_visible_notes}\n\n` : ''}${notePrefix}`
      : workOrder.customer_visible_notes

  const { data: updated, error: updateError } = await supabase
    .from('work_orders')
    .update({
      status,
      customer_visible_notes: nextCustomerNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  await supabase.from('audit_logs').insert({
    organization_id: orgId,
    user_id: ctx.user.id,
    action: action === 'approve' ? 'work_order.approved' : 'work_order.rejected',
    entity_type: 'work_order',
    entity_id: params.id,
    metadata_json: {
      work_order_number: workOrder.work_order_number,
      owner_notes: ownerNotes || null,
    },
  })

  return NextResponse.json({ work_order: updated })
}
