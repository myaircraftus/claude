import { NextRequest, NextResponse } from 'next/server'
import { describeEstimateTotal, sendOwnerApprovalEmail } from '@/lib/approvals'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import {
  normalizeEstimateLineType,
  normalizeEstimateStatus,
  statusRequiresAircraft,
  statusRequiresOwner,
  writeEstimateAudit,
  writeEstimateTimeline,
} from '@/lib/estimates/workflow'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildClassificationPatch } from '@/lib/taxonomy/format'

function toLineItems(
  organizationId: string,
  estimateId: string,
  lines: any[]
) {
  return lines.map((line, index) => ({
    organization_id: organizationId,
    estimate_id: estimateId,
    description: line.description ?? line.desc ?? 'Line item',
    quantity:
      typeof line.quantity === 'number'
        ? line.quantity
        : typeof line.qty === 'number'
          ? line.qty
          : typeof line.hours === 'number'
            ? line.hours
            : 1,
    unit_price:
      typeof line.unit_price === 'number'
        ? line.unit_price
        : typeof line.price === 'number'
          ? line.price
          : typeof line.rate === 'number'
            ? line.rate
            : typeof line.cost === 'number'
              ? line.cost
              : 0,
    item_type: line.item_type,
    hours: typeof line.hours === 'number' ? line.hours : null,
    part_number: line.part_number ?? line.pn ?? null,
    vendor: line.vendor ?? null,
    condition: line.condition ?? null,
    line_status: line.line_status ?? line.status ?? null,
    source_type: line.source_type ?? null,
    source_id: line.source_id ?? null,
    source_label: line.source_label ?? line.source ?? 'Manual',
    billable: line.billable ?? true,
    owner_visible: line.owner_visible ?? true,
    inventory_part_id: line.inventory_part_id ?? null,
    inventory_status: line.inventory_status ?? null,
    tax_code: line.tax_code ?? null,
    amount_snapshot:
      typeof line.amount === 'number'
        ? line.amount
        : typeof line.line_total === 'number'
          ? line.line_total
          : null,
    sort_order: index,
    ...buildClassificationPatch(line),
  }))
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const aircraftId = searchParams.get('aircraft_id')
  const customerId = searchParams.get('customer_id')
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('estimates')
    .select(
      `
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      customer:customer_id (id, name, email, company),
      line_items:estimate_line_items (*),
      ai_drafts:estimate_ai_drafts (*),
      approvals:owner_approvals (*),
      deposits:deposit_payments (*)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', normalizeEstimateStatus(status))
  if (aircraftId) query = query.eq('aircraft_id', aircraftId)
  if (customerId) query = query.eq('customer_id', customerId)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ estimates: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req, { includeOrganization: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()

  const body = await req.json()
  const organizationId = ctx.organizationId
  const { data: aircraft } = body.aircraft_id
    ? await supabase
        .from('aircraft')
        .select('id, owner_customer_id')
        .eq('id', body.aircraft_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
    : { data: null }
  const resolvedCustomerId = body.customer_id ?? aircraft?.owner_customer_id ?? null
  const requestedStatus = normalizeEstimateStatus(body.status)
  const shouldAutoSendForApproval =
    ctx.role === 'mechanic' &&
    !body.status &&
    !!resolvedCustomerId

  let estimateNumber = body.estimate_number ?? null
  if (!estimateNumber) {
    const { data: generatedNumber, error: rpcError } = await supabase.rpc(
      'generate_estimate_number',
      { org_id: organizationId }
    )
    if (rpcError || !generatedNumber) {
      estimateNumber = `EST-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
    } else {
      estimateNumber = generatedNumber
    }
  }

  const status = shouldAutoSendForApproval ? 'sent' : requestedStatus
  if (statusRequiresAircraft(status) && !aircraft) {
    return NextResponse.json({ error: 'Aircraft is required before official estimate send or approval' }, { status: 400 })
  }
  if (statusRequiresOwner(status) && !resolvedCustomerId) {
    return NextResponse.json({ error: 'Owner/customer is required before official estimate send or approval' }, { status: 400 })
  }

  const laborTotal = Number(body.labor_total ?? 0)
  const partsTotal = Number(body.parts_total ?? 0)
  const outsideTotal = Number(body.outside_services_total ?? 0)
  const total = Number(body.total ?? laborTotal + partsTotal + outsideTotal)
  const { data: organization } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', organizationId)
    .single()

  const { data: estimate, error } = await supabase
    .from('estimates')
    .insert({
      organization_id: organizationId,
      estimate_number: estimateNumber,
      aircraft_id: body.aircraft_id ?? null,
      customer_id: resolvedCustomerId,
      created_by: ctx.user.id,
      mechanic_name: body.mechanic_name ?? null,
      status,
      source_type: body.source_type ?? body.source_context ?? 'manual',
      source_id: body.source_id ?? null,
      estimate_type: body.estimate_type ?? body.service_type ?? null,
      price_book_id: body.price_book_id ?? null,
      tax_profile_id: body.tax_profile_id ?? null,
      terms: body.terms ?? null,
      deposit_required: Boolean(body.deposit_required),
      deposit_amount: Number(body.deposit_amount ?? 0),
      deposit_due_policy: body.deposit_due_policy ?? null,
      deposit_status: body.deposit_required
        ? body.deposit_status ?? 'requested'
        : body.deposit_status ?? 'not_required',
      approval_status:
        body.approval_status ??
        (status === 'sent' || status === 'awaiting_approval' ? 'sent' : status === 'ready_to_send' ? 'ready' : 'not_requested'),
      owner_approval_summary: body.owner_approval_summary ?? null,
      ai_review_status: body.ai_review_status ?? (body.ai_draft ? 'draft' : 'not_started'),
      service_type: body.service_type ?? null,
      assumptions: body.assumptions ?? null,
      internal_notes: body.internal_notes ?? null,
      customer_notes: body.customer_notes ?? null,
      labor_total: laborTotal,
      parts_total: partsTotal,
      outside_services_total: outsideTotal,
      total,
      valid_until: body.valid_until ?? null,
      linked_work_order_id: body.linked_work_order_id ?? null,
      converted_work_order_id: body.converted_work_order_id ?? body.linked_work_order_id ?? null,
      linked_squawk_ids: Array.isArray(body.linked_squawk_ids) ? body.linked_squawk_ids : [],
      ...buildClassificationPatch(body, {
        ataKey: 'primary_ata_code',
        jascKey: 'primary_jasc_code',
      }),
    })
    .select()
    .single()

  if (error || !estimate) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create estimate' }, { status: 500 })
  }

  const laborLines = Array.isArray(body.labor_lines) ? body.labor_lines : []
  const partsLines = Array.isArray(body.parts_lines) ? body.parts_lines : []
  const outsideLines = Array.isArray(body.outside_services) ? body.outside_services : []
  const supplyLines = Array.isArray(body.supply_lines) ? body.supply_lines : []
  const feeLines = Array.isArray(body.fee_lines) ? body.fee_lines : []
  const lineItems = [
    ...toLineItems(organizationId, estimate.id, laborLines.map((line: any) => ({ ...line, item_type: normalizeEstimateLineType(line.item_type ?? 'labor') }))),
    ...toLineItems(organizationId, estimate.id, partsLines.map((line: any) => ({ ...line, item_type: normalizeEstimateLineType(line.item_type ?? 'part') }))),
    ...toLineItems(organizationId, estimate.id, outsideLines.map((line: any) => ({ ...line, item_type: normalizeEstimateLineType(line.item_type ?? 'outside_service') }))),
    ...toLineItems(organizationId, estimate.id, supplyLines.map((line: any) => ({ ...line, item_type: normalizeEstimateLineType(line.item_type ?? 'supply') }))),
    ...toLineItems(organizationId, estimate.id, feeLines.map((line: any) => ({ ...line, item_type: normalizeEstimateLineType(line.item_type ?? 'fee') }))),
  ]

  if (lineItems.length > 0) {
    const { error: lineError } = await supabase.from('estimate_line_items').insert(lineItems)
    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 500 })
    }
  }

  if (body.ai_draft) {
    await supabase.from('estimate_ai_drafts').insert({
      organization_id: organizationId,
      estimate_id: estimate.id,
      aircraft_id: body.aircraft_id ?? null,
      prompt: body.ai_draft.prompt ?? body.prompt ?? null,
      transcript: body.ai_draft.transcript ?? body.transcript ?? null,
      attachments: body.ai_draft.attachments ?? [],
      selected_squawk_ids: Array.isArray(body.linked_squawk_ids) ? body.linked_squawk_ids : [],
      model_output_json: body.ai_draft.model_output_json ?? body.ai_draft,
      confidence: typeof body.ai_draft.confidence === 'number' ? body.ai_draft.confidence : null,
      warnings: body.ai_draft.warnings ?? [],
      status: body.ai_review_status === 'accepted' ? 'accepted' : 'draft',
      accepted_by: body.ai_review_status === 'accepted' ? ctx.user.id : null,
      accepted_at: body.ai_review_status === 'accepted' ? new Date().toISOString() : null,
      created_by: ctx.user.id,
    })
  }

  const { data: fullEstimate } = await supabase
    .from('estimates')
    .select(
      `
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      customer:customer_id (id, name, email, company),
      line_items:estimate_line_items (*)
    `
    )
    .eq('id', estimate.id)
    .single()

  const estimateForResponse = fullEstimate ?? estimate
  const customerEmail = (estimateForResponse as any)?.customer?.email as string | undefined

  let ownerApprovalEmailSent = false
  if (shouldAutoSendForApproval && customerEmail) {
    try {
      const emailResult = await sendOwnerApprovalEmail({
        recipientEmail: customerEmail,
        orgName: organization?.name ?? 'myaircraft.us',
        tenantSlug: organization?.slug ?? ctx.organization?.slug ?? null,
        subject: `Estimate ${estimateNumber} awaiting your approval`,
        heading: `Estimate ${estimateNumber}`,
        intro: 'A mechanic prepared an estimate for your aircraft. Open the app to approve or reject it.',
        actionLabel: 'Review Estimate',
        actionPath: `/estimates/${estimate.id}`,
        detailRows: [
          { label: 'Estimate', value: estimateNumber },
          { label: 'Total', value: describeEstimateTotal(total) },
          { label: 'Status', value: 'Awaiting approval' },
        ],
      })
      ownerApprovalEmailSent = emailResult.sent
    } catch (emailError) {
      console.error('[estimates] Failed to send owner approval email', emailError)
    }
  }

  await writeEstimateAudit(supabase, req, {
    organizationId,
    userId: ctx.user.id,
    action: shouldAutoSendForApproval ? 'estimate.created.sent_for_approval' : 'estimate.created',
    estimateId: estimate.id,
    aircraftId: body.aircraft_id ?? null,
    metadata: {
      estimate_number: estimateNumber,
      customer_id: resolvedCustomerId,
      source_type: body.source_type ?? body.source_context ?? 'manual',
      linked_squawk_ids: Array.isArray(body.linked_squawk_ids) ? body.linked_squawk_ids : [],
      deposit_required: Boolean(body.deposit_required),
      deposit_amount: Number(body.deposit_amount ?? 0),
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
  })

  await writeEstimateTimeline(supabase, {
    organizationId,
    aircraftId: body.aircraft_id ?? null,
    actorId: ctx.user.id,
    action: shouldAutoSendForApproval ? 'estimate.created.sent_for_approval' : 'estimate.created',
    estimateId: estimate.id,
    title: `Estimate created: ${estimateNumber}`,
    summary: body.service_type ?? body.customer_notes ?? null,
    ownerVisible: status === 'sent' || status === 'awaiting_approval',
    metadata: {
      total,
      deposit_required: Boolean(body.deposit_required),
      linked_squawk_ids: Array.isArray(body.linked_squawk_ids) ? body.linked_squawk_ids : [],
    },
  })

  return NextResponse.json(
    {
      ...estimateForResponse,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
    { status: 201 }
  )
}
