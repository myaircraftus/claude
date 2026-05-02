import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { sendOwnerApprovalEmail } from '@/lib/approvals'
import {
  generateWorkOrderChecklist,
  extractChecklistTemplateReferenceLibrary,
  type ChecklistTemplateOverrides,
} from '@/lib/work-orders/checklists'
import { toDbWorkOrderStatus } from '@/lib/work-orders/status'
import { BillingBlockedError, requireActiveBilling } from '@/lib/billing/gate'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const aircraft_id = searchParams.get('aircraft_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, service_type, customer_complaint:complaint, discrepancy,
      corrective_action, findings, internal_notes, customer_notes:customer_visible_notes, labor_total,
      parts_total, outside_services_total, tax_amount, total:total_amount, opened_at, closed_at,
      created_at, updated_at, aircraft_id, customer_id, assigned_mechanic_id,
      thread_id,
      aircraft:aircraft_id (id, tail_number, make, model),
      customer:customer_id (id, name, company, email)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ work_orders: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req, { includeOrganization: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireActiveBilling(ctx.organizationId, 'mechanic')
  } catch (err) {
    if (err instanceof BillingBlockedError) {
      return NextResponse.json({ error: err.message, billing: err.status }, { status: 402 })
    }
    throw err
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId
  const user = ctx.user
  const role = ctx.role
  const body = await req.json()

  const { data: aircraft } = body.aircraft_id
    ? await supabase
        .from('aircraft')
        .select('id, tail_number, make, model, year, engine_make, engine_model, owner_customer_id')
        .eq('id', body.aircraft_id)
        .eq('organization_id', orgId)
        .maybeSingle()
    : { data: null }

  const { data: organization } = await supabase
    .from('organizations')
    .select('checklist_templates, name, slug')
    .eq('id', orgId)
    .single()

  // Generate work order number: WO-YYYY-NNNN
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const work_order_number = `WO-${year}-${seq}`

  const customerId =
    body.customer_id ??
    aircraft?.owner_customer_id ??
    null
  const requestedStatus = toDbWorkOrderStatus(body.status)
  const ownerApprovalRequired =
    role === 'mechanic' &&
    !!customerId &&
    !body.skip_owner_approval &&
    requestedStatus !== 'archived'
  const assignedMechanicId =
    body.assigned_mechanic_id ??
    (role === 'mechanic' ? user.id : null)
  const { data: customer } = customerId
    ? await supabase
        .from('customers')
        .select('id, name, email')
        .eq('id', customerId)
        .eq('organization_id', orgId)
        .maybeSingle()
    : { data: null }

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      organization_id: orgId,
      work_order_number,
      aircraft_id: body.aircraft_id ?? null,
      customer_id: customerId,
      assigned_mechanic_id: assignedMechanicId,
      status: ownerApprovalRequired ? 'awaiting_approval' : requestedStatus,
      service_type: body.service_type ?? null,
      complaint: body.complaint ?? null,
      discrepancy: body.discrepancy ?? body.complaint ?? null,
      corrective_action: body.corrective_action ?? null,
      findings: body.findings ?? null,
      internal_notes: body.internal_notes ?? null,
      customer_visible_notes: body.customer_notes ?? body.customer_visible_notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // checklist_source values from the unified create modal:
  //   'template' → use shop template only (no AI gap-fill)
  //   'ai'       → template + AI-generated gap items (default behavior)
  //   'skip'     → no template-driven items at all (AD/SB still added below)
  const checklistSource: 'template' | 'ai' | 'skip' =
    body.checklist_source === 'template' || body.checklist_source === 'skip'
      ? body.checklist_source
      : 'ai'

  const checklist = checklistSource === 'skip'
    ? { items: [] as Array<any>, templateLabel: '' }
    : generateWorkOrderChecklist({
        serviceType: body.service_type ?? null,
        complaint: body.complaint ?? null,
        discrepancy: body.discrepancy ?? null,
        aircraft: aircraft
          ? {
              tailNumber: aircraft.tail_number,
              make: aircraft.make,
              model: aircraft.model,
              year: aircraft.year,
              engineMake: aircraft.engine_make,
              engineModel: aircraft.engine_model,
            }
          : null,
        templateOverrides: (organization?.checklist_templates ?? {}) as ChecklistTemplateOverrides,
        templateReferenceLibrary: extractChecklistTemplateReferenceLibrary(
          organization?.checklist_templates
        ),
      })

  // If user picked "template" only, drop any AI-generated gap items.
  if (checklistSource === 'template' && checklist.items?.length) {
    checklist.items = checklist.items.filter((item: any) => item.source !== 'ai')
  }

  // Pull AD/SB applicability for this aircraft and turn each item into a
  // checklist row. Overdue / unknown ADs are flagged required so closing
  // the WO forces the mechanic to actually mark them resolved. Compliant
  // items are included as non-required reference rows ("verified at WO
  // open" — gives the mechanic a snapshot of what was current at the time).
  let adSbChecklistItems: Array<{
    organization_id: string
    work_order_id: string
    aircraft_id: string | null
    template_key: string
    template_label: string
    section: string
    item_key: string
    item_label: string
    item_description: string | null
    source: string
    source_reference: string
    required: boolean
    sort_order: number
  }> = []
  if (body.aircraft_id) {
    try {
      const { data: ads } = await supabase
        .from('aircraft_ad_applicability')
        .select(`
          ad_number,
          compliance_status,
          last_compliance_date,
          next_due_date,
          faa_airworthiness_directives:ad_id ( title, recurring )
        `)
        .eq('aircraft_id', body.aircraft_id)
        .order('compliance_status', { ascending: true })

      const baseSort = checklist.items.length + 100
      adSbChecklistItems = ((ads ?? []) as any[])
        .map((row, idx) => {
          const fad = Array.isArray(row.faa_airworthiness_directives)
            ? row.faa_airworthiness_directives[0]
            : row.faa_airworthiness_directives
          const status = String(row.compliance_status ?? 'unknown')
          const isResolved = status === 'compliant'
          const dueLabel = row.next_due_date ? ` (due ${row.next_due_date})` : ''
          const lastLabel = row.last_compliance_date ? ` · last ${row.last_compliance_date}` : ''
          return {
            organization_id: orgId,
            work_order_id: data.id,
            aircraft_id: body.aircraft_id ?? null,
            template_key: 'ad_sb_compliance',
            template_label: 'AD / SB Compliance',
            section: status === 'overdue' ? 'AD / SB — Overdue' : status === 'unknown' ? 'AD / SB — Verify Status' : 'AD / SB — Compliant',
            item_key: `ad_${row.ad_number}`,
            item_label: `${row.ad_number}${fad?.title ? ' — ' + fad.title : ''}`,
            item_description:
              `Status at WO open: ${status.toUpperCase()}${lastLabel}${dueLabel}.` +
              (isResolved
                ? ' Verified compliant — review only if work scope touches this system.'
                : status === 'overdue'
                  ? ' OVERDUE — perform compliance action and record N/P + tach time before closing.'
                  : ' Compliance unknown — verify aircraft records and update before closing.'),
            source: 'ad_sb',
            source_reference: row.ad_number,
            required: !isResolved, // overdue + unknown must be resolved to close
            sort_order: baseSort + idx,
          }
        })
    } catch (err) {
      console.warn('[work-orders] Failed to pull AD/SB applicability for checklist:', err)
    }
  }

  const allChecklistRows = [
    ...checklist.items.map((item) => ({
      organization_id: orgId,
      work_order_id: data.id,
      aircraft_id: body.aircraft_id ?? null,
      template_key: item.templateKey,
      template_label: item.templateLabel,
      section: item.section,
      item_key: item.itemKey,
      item_label: item.itemLabel,
      item_description: item.itemDescription,
      source: item.source,
      source_reference: item.sourceReference,
      required: item.required,
      sort_order: item.sortOrder,
    })),
    ...adSbChecklistItems,
  ]

  if (allChecklistRows.length > 0) {
    const { error: checklistError } = await supabase
      .from('work_order_checklist_items')
      .insert(allChecklistRows)

    if (checklistError) {
      return NextResponse.json({ error: checklistError.message }, { status: 500 })
    }
  }

  // Link any squawks the user picked into this WO so they show up in the
  // detail view + flip to "in_work_order" status.
  const includedSquawkIds = Array.isArray(body.included_squawk_ids)
    ? (body.included_squawk_ids as unknown[]).filter((v): v is string => typeof v === 'string')
    : []
  if (includedSquawkIds.length > 0) {
    try {
      await supabase
        .from('squawks')
        .update({
          assigned_work_order_id: data.id,
          status: 'in_work_order',
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)
        .in('id', includedSquawkIds)
    } catch (sqErr) {
      console.warn('[work-orders] Failed to attach squawks to new WO:', sqErr)
    }
  }

  let ownerApprovalEmailSent = false
  if (ownerApprovalRequired && customer?.email) {
    try {
      const emailResult = await sendOwnerApprovalEmail({
        recipientEmail: customer.email,
        orgName: organization?.name ?? 'myaircraft.us',
        tenantSlug: organization?.slug ?? ctx.organization?.slug ?? null,
        subject: `Work order ${work_order_number} awaiting your approval`,
        heading: `Work order ${work_order_number}`,
        intro: 'A mechanic created a work order for your aircraft. Open the app to review the scope and approve or reject it.',
        actionLabel: 'Review Work Order',
        actionPath: `/work-orders/${data.id}`,
        detailRows: [
          { label: 'Aircraft', value: aircraft?.tail_number ?? null },
          { label: 'Customer', value: customer.name ?? null },
          { label: 'Status', value: 'Awaiting approval' },
        ],
      })
      ownerApprovalEmailSent = emailResult.sent
    } catch (emailError) {
      console.error('[work-orders] Failed to send owner approval email', emailError)
    }
  }

  await supabase.from('audit_logs').insert({
    organization_id: orgId,
    user_id: user.id,
    action: ownerApprovalRequired ? 'work_order.created.awaiting_approval' : 'work_order.created',
    entity_type: 'work_order',
    entity_id: data.id,
    metadata_json: {
      work_order_number: work_order_number,
      aircraft_id: body.aircraft_id ?? null,
      customer_id: customerId,
      owner_approval_required: ownerApprovalRequired,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
  })

  return NextResponse.json(
    {
      ...data,
      checklist_template_key: (checklist as any).templateKey ?? null,
      owner_approval_required: ownerApprovalRequired,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
    { status: 201 }
  )
}
