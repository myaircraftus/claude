import { NextRequest, NextResponse } from 'next/server'
import { createWorkOrderFromEstimate } from '@/lib/approvals'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { ADMIN_AND_ABOVE } from '@/lib/roles'
import { createServerSupabase } from '@/lib/supabase/server'

type ApprovalAction = 'approve' | 'reject' | 'question'

function isApprovalAction(value: unknown): value is ApprovalAction {
  return value === 'approve' || value === 'reject' || value === 'question'
}

function requestIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
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
    return NextResponse.json({ error: 'action must be approve, reject, or question' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data: estimate, error: estimateError } = await supabase
    .from('estimates')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model),
      customer:customer_id (id, name, email),
      organization:organization_id (id, name, slug),
      line_items:estimate_line_items (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (estimateError || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  if (action === 'reject') {
    if (estimate.status === 'rejected' || estimate.status === 'declined') {
      return NextResponse.json({ estimate })
    }

    const { data: updated, error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'declined',
        approval_status: 'declined',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    await supabase.from('owner_approvals').insert({
      organization_id: orgId,
      estimate_id: params.id,
      aircraft_id: estimate.aircraft_id ?? null,
      owner_id: estimate.customer_id ?? null,
      guest_identity: body.guest_identity ?? {},
      approved_scope_snapshot: { estimate_number: estimate.estimate_number, total: estimate.total, line_items: estimate.line_items ?? [] },
      approved_amount: Number(estimate.total ?? 0),
      approved_terms: estimate.terms ?? null,
      deposit_status: estimate.deposit_status ?? null,
      action: 'declined',
      ip_address: requestIp(req),
      device_metadata: { user_agent: req.headers.get('user-agent') },
      signature_or_typed_name: body.signature_or_typed_name ?? null,
      created_by: ctx.user.id,
    })

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      user_id: ctx.user.id,
      action: 'estimate.rejected',
      entity_type: 'estimate',
      entity_id: params.id,
      metadata_json: {
        estimate_number: estimate.estimate_number,
      },
    })

    return NextResponse.json({ estimate: updated })
  }

  if (action === 'question') {
    const { data: updated, error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'owner_question',
        approval_status: 'owner_question',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await supabase.from('owner_approvals').insert({
      organization_id: orgId,
      estimate_id: params.id,
      aircraft_id: estimate.aircraft_id ?? null,
      owner_id: estimate.customer_id ?? null,
      guest_identity: body.guest_identity ?? {},
      approved_scope_snapshot: { estimate_number: estimate.estimate_number, question: body.question ?? null },
      approved_amount: Number(estimate.total ?? 0),
      approved_terms: estimate.terms ?? null,
      deposit_status: estimate.deposit_status ?? null,
      action: 'question',
      ip_address: requestIp(req),
      device_metadata: { user_agent: req.headers.get('user-agent') },
      signature_or_typed_name: body.signature_or_typed_name ?? null,
      created_by: ctx.user.id,
    })

    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      user_id: ctx.user.id,
      action: 'estimate.owner_question',
      entity_type: 'estimate',
      entity_id: params.id,
      metadata_json: {
        estimate_number: estimate.estimate_number,
        question: body.question ?? null,
      },
    })

    return NextResponse.json({ estimate: updated })
  }

  if (!['sent', 'awaiting_approval', 'awaiting_deposit', 'approved', 'deposit_paid', 'converted', 'converted_to_work_order'].includes(estimate.status)) {
    return NextResponse.json(
      { error: `Estimate cannot be approved from status "${estimate.status}"` },
      { status: 409 }
    )
  }

  try {
    const workOrder = await createWorkOrderFromEstimate({
      supabase,
      organizationId: orgId,
      estimate,
      fallbackAssignedMechanicId: estimate.created_by ?? null,
    })

    const { data: updated, error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'converted',
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by_identity: body.guest_identity ?? { user_id: ctx.user.id },
        linked_work_order_id: workOrder.id,
        converted_work_order_id: workOrder.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)
      .select()
      .single()

    await supabase.from('owner_approvals').insert({
      organization_id: orgId,
      estimate_id: params.id,
      aircraft_id: estimate.aircraft_id ?? null,
      owner_id: estimate.customer_id ?? null,
      guest_identity: body.guest_identity ?? {},
      approved_scope_snapshot: {
        estimate_number: estimate.estimate_number,
        total: estimate.total,
        line_items: estimate.line_items ?? [],
        linked_squawk_ids: estimate.linked_squawk_ids ?? [],
      },
      approved_amount: Number(estimate.total ?? 0),
      approved_terms: estimate.terms ?? null,
      deposit_status: estimate.deposit_status ?? null,
      action: 'approved',
      ip_address: requestIp(req),
      device_metadata: { user_agent: req.headers.get('user-agent') },
      signature_or_typed_name: body.signature_or_typed_name ?? null,
      created_by: ctx.user.id,
    })

    if (body.deposit_payment) {
      await supabase.from('deposit_payments').insert({
        organization_id: orgId,
        estimate_id: params.id,
        owner_id: estimate.customer_id ?? null,
        method: body.deposit_payment.method ?? 'manual',
        amount: Number(body.deposit_payment.amount ?? estimate.deposit_amount ?? 0),
        status: body.deposit_payment.status ?? 'pending',
        proof_attachment_id: body.deposit_payment.proof_attachment_id ?? null,
        external_payment_reference: body.deposit_payment.external_payment_reference ?? null,
        verified_by: body.deposit_payment.status === 'paid' || body.deposit_payment.status === 'verified' ? ctx.user.id : null,
        verified_at: body.deposit_payment.status === 'paid' || body.deposit_payment.status === 'verified' ? new Date().toISOString() : null,
        metadata: body.deposit_payment.metadata ?? {},
      })
    }

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      user_id: ctx.user.id,
      action: 'estimate.approved_and_converted',
      entity_type: 'estimate',
      entity_id: params.id,
      metadata_json: {
        estimate_number: estimate.estimate_number,
        work_order_id: workOrder.id,
        work_order_number: workOrder.work_order_number,
      },
    })

    return NextResponse.json({
      estimate: updated,
      work_order_id: workOrder.id,
      work_order_number: workOrder.work_order_number,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to approve estimate' },
      { status: 500 }
    )
  }
}
