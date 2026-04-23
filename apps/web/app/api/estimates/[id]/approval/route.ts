import { NextRequest, NextResponse } from 'next/server'
import { createWorkOrderFromEstimate } from '@/lib/approvals'
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
    if (estimate.status === 'rejected') {
      return NextResponse.json({ estimate })
    }

    const { data: updated, error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'rejected',
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
      action: 'estimate.rejected',
      entity_type: 'estimate',
      entity_id: params.id,
      metadata_json: {
        estimate_number: estimate.estimate_number,
      },
    })

    return NextResponse.json({ estimate: updated })
  }

  if (!['sent', 'approved', 'converted'].includes(estimate.status)) {
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
        linked_work_order_id: workOrder.id,
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
