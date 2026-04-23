import { NextRequest, NextResponse } from 'next/server'
import { describeEstimateTotal, sendOwnerApprovalEmail } from '@/lib/approvals'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

function normalizeEstimateStatus(value: unknown): string {
  if (typeof value !== 'string') return 'draft'
  const normalized = value.trim().toLowerCase()
  if (['draft', 'sent', 'approved', 'rejected', 'converted'].includes(normalized)) {
    return normalized
  }
  return 'draft'
}

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
    sort_order: index,
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
      line_items:estimate_line_items (*)
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
      linked_squawk_ids: Array.isArray(body.linked_squawk_ids) ? body.linked_squawk_ids : [],
    })
    .select()
    .single()

  if (error || !estimate) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create estimate' }, { status: 500 })
  }

  const laborLines = Array.isArray(body.labor_lines) ? body.labor_lines : []
  const partsLines = Array.isArray(body.parts_lines) ? body.parts_lines : []
  const outsideLines = Array.isArray(body.outside_services) ? body.outside_services : []
  const lineItems = [
    ...toLineItems(organizationId, estimate.id, laborLines.map((line: any) => ({ ...line, item_type: 'labor' }))),
    ...toLineItems(organizationId, estimate.id, partsLines.map((line: any) => ({ ...line, item_type: 'part' }))),
    ...toLineItems(organizationId, estimate.id, outsideLines.map((line: any) => ({ ...line, item_type: 'outside_service' }))),
  ]

  if (lineItems.length > 0) {
    const { error: lineError } = await supabase.from('estimate_line_items').insert(lineItems)
    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 500 })
    }
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

  await supabase.from('audit_logs').insert({
    organization_id: organizationId,
    user_id: ctx.user.id,
    action: shouldAutoSendForApproval ? 'estimate.created.sent_for_approval' : 'estimate.created',
    entity_type: 'estimate',
    entity_id: estimate.id,
    metadata_json: {
      estimate_number: estimateNumber,
      customer_id: resolvedCustomerId,
      owner_approval_email_sent: ownerApprovalEmailSent,
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
