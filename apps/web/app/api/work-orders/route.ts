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

  const checklist = generateWorkOrderChecklist({
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

  if (checklist.items.length > 0) {
    const { error: checklistError } = await supabase.from('work_order_checklist_items').insert(
      checklist.items.map((item) => ({
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
      }))
    )

    if (checklistError) {
      return NextResponse.json({ error: checklistError.message }, { status: 500 })
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
      checklist_template_key: checklist.templateKey,
      owner_approval_required: ownerApprovalRequired,
      owner_approval_email_sent: ownerApprovalEmailSent,
    },
    { status: 201 }
  )
}
