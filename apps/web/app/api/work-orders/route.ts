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
import { buildClassificationPatch } from '@/lib/taxonomy/format'

function toWorkOrderLineType(value: unknown) {
  const raw = typeof value === 'string' ? value : ''
  if (raw === 'part' || raw === 'outside_service' || raw === 'discrepancy' || raw === 'note') return raw
  if (['supply', 'fee', 'tax', 'discount'].includes(raw)) return 'outside_service'
  return 'labor'
}

async function recalculateWorkOrderTotals(
  supabase: ReturnType<typeof createServerSupabase>,
  workOrderId: string
) {
  const { data: lines } = await supabase
    .from('work_order_lines')
    .select('line_type, line_total')
    .eq('work_order_id', workOrderId)

  const labor_total = (lines ?? [])
    .filter((line) => line.line_type === 'labor')
    .reduce((sum, line) => sum + Number(line.line_total ?? 0), 0)
  const parts_total = (lines ?? [])
    .filter((line) => line.line_type === 'part')
    .reduce((sum, line) => sum + Number(line.line_total ?? 0), 0)
  const outside_services_total = (lines ?? [])
    .filter((line) => line.line_type === 'outside_service')
    .reduce((sum, line) => sum + Number(line.line_total ?? 0), 0)
  const total_amount = labor_total + parts_total + outside_services_total

  await supabase
    .from('work_orders')
    .update({
      labor_total,
      parts_total,
      outside_services_total,
      total_amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', workOrderId)

  return { labor_total, parts_total, outside_services_total, total_amount }
}

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
      primary_ata_code, primary_jasc_code, classification_source, classification_confidence, classification_status,
      thread_id,
      aircraft:aircraft_id (id, tail_number, make, model),
      customer:customer_id (id, name, company, email)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    // Spec 6.8 — exclude soft-deleted rows from the live list.
    .is('deleted_at', null)
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

  // Generate work order number through the DB helper when available. The
  // count-based fallback is retained for environments that have not run the
  // original work-order migration yet.
  let work_order_number: string
  const { data: generatedNumber, error: numberError } = await supabase.rpc(
    'generate_work_order_number',
    { org_id: orgId }
  )
  if (numberError || !generatedNumber) {
    const year = new Date().getFullYear()
    const { count } = await supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    work_order_number = `WO-${year}-${seq}`
  } else {
    work_order_number = generatedNumber
  }

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
      ...buildClassificationPatch(
        {
          ...body,
          primary_ata_code: body.primary_ata_code ?? body.ata_code,
          primary_jasc_code: body.primary_jasc_code ?? body.jasc_code,
        },
        { ataKey: 'primary_ata_code', jascKey: 'primary_jasc_code' },
      ),
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

  const existingEstimateId =
    typeof body.existing_estimate_id === 'string' && body.existing_estimate_id
      ? body.existing_estimate_id
      : null
  let attachedEstimate:
    | { id: string; estimate_number?: string | null; line_count: number; total_amount: number }
    | null = null

  if (existingEstimateId) {
    const { data: estimate, error: estimateError } = await supabase
      .from('estimates')
      .select(`
        id,
        estimate_number,
        status,
        total,
        line_items:estimate_line_items (*)
      `)
      .eq('id', existingEstimateId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (estimateError) {
      return NextResponse.json({ error: estimateError.message }, { status: 500 })
    }

    if (estimate) {
      const estimateLines = Array.isArray((estimate as any).line_items)
        ? ((estimate as any).line_items as any[])
        : []
      const plannedRows = estimateLines.map((line, index) => {
        const lineType = toWorkOrderLineType(line.item_type)
        const quantity = Number(line.quantity ?? line.hours ?? 1)
        const unitPrice = Number(line.unit_price ?? 0)
        return {
          organization_id: orgId,
          work_order_id: data.id,
          line_type: lineType,
          description: line.description ?? 'Estimate line item',
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
          unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
          part_number: line.part_number ?? null,
          vendor: line.vendor ?? null,
          condition: line.condition ?? null,
          status: lineType === 'part' ? 'pending' : 'n/a',
          hours: lineType === 'labor' ? Number(line.hours ?? line.quantity ?? null) || null : null,
          rate: lineType === 'labor' ? unitPrice : null,
          notes: `Planned from estimate ${estimate.estimate_number ?? ''}`.trim(),
          sort_order: index,
          planned_from_estimate_id: estimate.id,
          estimate_line_item_id: line.id ?? null,
          source_type: line.source_type ?? 'estimate',
          source_id: line.source_id ?? line.id ?? null,
          source_label: line.source_label ?? 'Estimate',
          billable: line.billable ?? true,
          owner_visible: line.owner_visible ?? true,
          ...buildClassificationPatch(line),
        }
      })

      if (plannedRows.length > 0) {
        const { error: lineError } = await supabase
          .from('work_order_lines')
          .insert(plannedRows)

        if (lineError) {
          return NextResponse.json({ error: lineError.message }, { status: 500 })
        }

        await recalculateWorkOrderTotals(supabase, data.id)
      }

      await supabase
        .from('estimates')
        .update({
          linked_work_order_id: data.id,
          converted_work_order_id: data.id,
          status: 'converted',
          approval_status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', estimate.id)
        .eq('organization_id', orgId)

      attachedEstimate = {
        id: estimate.id,
        estimate_number: estimate.estimate_number,
        line_count: plannedRows.length,
        total_amount: Number(estimate.total ?? 0),
      }
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
      estimate_mode: body.estimate_mode ?? null,
      attached_estimate: attachedEstimate,
      planned_task_count: Array.isArray(body.planned_tasks) ? body.planned_tasks.length : 0,
      checklist_source: checklistSource,
      owner_approval_required: ownerApprovalRequired,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
  })

  return NextResponse.json(
    {
      ...data,
      checklist_template_key: (checklist as any).templateKey ?? null,
      attached_estimate: attachedEstimate,
      owner_approval_required: ownerApprovalRequired,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
    { status: 201 }
  )
}
