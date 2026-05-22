import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { BillingBlockedError, requireActiveBilling } from '@/lib/billing/gate'
import { buildClassificationPatch } from '@/lib/taxonomy/format'
import {
  calculateInvoiceTotals,
  normalizeInvoiceLineType,
  normalizeInvoiceStatus,
  sourceLabelForLine,
  writeInvoiceAudit,
  writeInvoiceTimeline,
} from '@/lib/invoices/workflow'

type InvoiceLineInput = {
  description: string
  quantity: number
  unit_price: number
  item_type: string
  source_type?: string | null
  source_id?: string | null
  source_label?: string | null
  work_order_line_id?: string | null
  sort_order?: number
  billable?: boolean
  owner_visible?: boolean
  approved_for_billing?: boolean
  tax_category?: string | null
  linked_task_id?: string | null
  linked_part_id?: string | null
  linked_labor_id?: string | null
  taxonomy?: Record<string, unknown>
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const customer_id = searchParams.get('customer_id')
  const aircraft_id = searchParams.get('aircraft_id')
  const work_order_id = searchParams.get('work_order_id')
  const source_type = searchParams.get('source_type')
  const payment_status = searchParams.get('payment_status')
  const q = searchParams.get('q')?.trim()
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, source_type, source_id, payment_status,
      invoice_date:issue_date,
      due_date,
      subtotal, tax_rate, tax_amount, fees_total, deposit_credit_total, total,
      amount_paid, payment_total, balance_due, notes,
      sent_at, paid_at, created_at,
      customer_id, payee_id, aircraft_id, work_order_id, estimate_id,
      customer:customer_id (id, name, email),
      payee:payee_id (id, name, email),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status),
      estimate:estimate_id (id, estimate_number, status)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', normalizeInvoiceStatus(status))
  if (customer_id) query = query.eq('customer_id', customer_id)
  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)
  if (work_order_id) query = query.eq('work_order_id', work_order_id)
  if (source_type) query = query.eq('source_type', source_type)
  if (payment_status) query = query.eq('payment_status', payment_status)
  if (q) query = query.or(`invoice_number.ilike.%${q}%,notes.ilike.%${q}%`)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await requireActiveBilling(ctx.organizationId, 'shop')
  } catch (err) {
    if (err instanceof BillingBlockedError) {
      return NextResponse.json({ error: err.message, billing: err.status }, { status: 402 })
    }
    throw err
  }

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId
  const body = await req.json()

  const sourceType = normalizeSourceType(
    body.source_type ??
      (body.work_order_id ? 'work_order' : body.estimate_id ? 'estimate' : body.manual_lines ? 'custom' : 'aircraft')
  )
  const lineItems: InvoiceLineInput[] = []

  let customer_id = body.customer_id ?? body.owner_id ?? body.payee_id ?? null
  let payee_id = body.payee_id ?? customer_id ?? null
  let aircraft_id = body.aircraft_id ?? null
  let work_order_id = body.work_order_id ?? null
  let estimate_id = body.estimate_id ?? null
  let thread_id = body.thread_id ?? null
  let source_id = body.source_id ?? null
  let sourceDescriptor = 'Manual invoice'

  if (sourceType === 'work_order') {
    work_order_id = work_order_id ?? source_id
    if (!work_order_id) return NextResponse.json({ error: 'work_order_id is required for work-order invoice source.' }, { status: 400 })

    const { data: wo } = await supabase
      .from('work_orders')
      .select(`
        id, aircraft_id, customer_id, thread_id, work_order_number,
        lines:work_order_lines (*)
      `)
      .eq('id', work_order_id)
      .eq('organization_id', orgId)
      .single()

    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    customer_id = customer_id || wo.customer_id
    payee_id = payee_id || customer_id
    aircraft_id = aircraft_id || wo.aircraft_id
    thread_id = thread_id || wo.thread_id
    source_id = wo.id
    sourceDescriptor = `Work order ${(wo as any).work_order_number ?? ''}`.trim()

    const woLines = (((wo as any).lines ?? []) as any[])
      .filter((line: any) => line.line_type !== 'note' && line.line_type !== 'discrepancy')
      .filter((line: any) => line.billable !== false && line.approved_for_billing !== false)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    woLines.forEach((line: any, idx: number) => {
      const itemType = normalizeInvoiceLineType(line.line_type)
      lineItems.push({
        description: line.description,
        quantity: Number(line.quantity ?? 1),
        unit_price: Number(line.unit_price ?? 0),
        item_type: itemType,
        work_order_line_id: line.id,
        source_type: 'work_order_line',
        source_id: line.id,
        source_label: sourceLabelForLine({ ...line, item_type: itemType }),
        sort_order: idx,
        billable: line.billable !== false,
        owner_visible: line.owner_visible !== false,
        approved_for_billing: true,
        linked_task_id: line.linked_task_id ?? null,
        linked_part_id: line.linked_part_id ?? line.inventory_part_id ?? null,
        taxonomy: line,
      })
    })

    const linkedEstimateId = await findEstimateForWorkOrder(supabase, orgId, work_order_id)
    estimate_id = estimate_id || linkedEstimateId
  } else if (sourceType === 'estimate') {
    estimate_id = estimate_id ?? source_id
    if (!estimate_id) return NextResponse.json({ error: 'estimate_id is required for estimate invoice source.' }, { status: 400 })

    const { data: estimate } = await supabase
      .from('estimates')
      .select(`
        id, estimate_number, aircraft_id, customer_id, status,
        line_items:estimate_line_items (*)
      `)
      .eq('id', estimate_id)
      .eq('organization_id', orgId)
      .single()

    if (!estimate) return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })

    customer_id = customer_id || estimate.customer_id
    payee_id = payee_id || customer_id
    aircraft_id = aircraft_id || estimate.aircraft_id
    source_id = estimate.id
    sourceDescriptor = `Estimate ${(estimate as any).estimate_number ?? ''}`.trim()

    const estimateLines = (((estimate as any).line_items ?? []) as any[])
      .filter((line: any) => line.billable !== false)
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    estimateLines.forEach((line: any, idx: number) => {
      const itemType = normalizeInvoiceLineType(line.item_type)
      lineItems.push({
        description: line.description,
        quantity: Number(line.quantity ?? 1),
        unit_price: Number(line.unit_price ?? 0),
        item_type: itemType,
        source_type: 'estimate_line',
        source_id: line.id,
        source_label: 'Estimate Reference',
        sort_order: idx,
        billable: line.billable !== false,
        owner_visible: line.owner_visible !== false,
        approved_for_billing: false,
        linked_part_id: line.inventory_part_id ?? null,
        tax_category: line.tax_code ?? null,
        taxonomy: line,
      })
    })
  } else {
    source_id = sourceType === 'aircraft' ? aircraft_id : body.source_id ?? null
    sourceDescriptor = sourceType === 'aircraft' ? 'Aircraft invoice builder' : 'Custom invoice'
  }

  const manualLines = Array.isArray(body.manual_lines) ? body.manual_lines : Array.isArray(body.line_items) ? body.line_items : []
  manualLines.forEach((line: any, idx: number) => {
    lineItems.push({
      description: line.description ?? '',
      quantity: Number(line.quantity ?? line.qty ?? 1),
      unit_price: Number(line.unit_price ?? line.rate ?? 0),
      item_type: normalizeInvoiceLineType(line.item_type ?? line.type),
      source_type: line.source_type ?? 'manual',
      source_id: line.source_id ?? null,
      source_label: line.source_label ?? 'Manual',
      sort_order: line.sort_order ?? (lineItems.length + idx),
      billable: line.billable !== false,
      owner_visible: line.owner_visible !== false,
      approved_for_billing: line.approved_for_billing !== false,
      tax_category: line.tax_category ?? line.tax_code ?? null,
      taxonomy: line,
    })
  })

  if (!aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required before an invoice can be created.' }, { status: 400 })
  }

  if ((sourceType === 'custom' || sourceType === 'manual') && !payee_id && !customer_id) {
    return NextResponse.json({ error: 'A payee/customer is required for custom/manual invoices.' }, { status: 400 })
  }

  const depositCredit = estimate_id
    ? await collectAvailableDepositCredit(supabase, orgId, estimate_id)
    : 0
  const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.quantity) * Number(li.unit_price)), 0)
  const totals = calculateInvoiceTotals({
    subtotal,
    taxRate: body.tax_rate ?? 0,
    taxAmount: body.tax_amount,
    discountAmount: body.discount_amount ?? 0,
    feesTotal: body.fees_total ?? 0,
  })

  const today = new Date().toISOString().split('T')[0]
  const dueDate = body.due_date ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const status = normalizeInvoiceStatus(body.status ?? 'draft')

  let invoice_number: string
  const { data: rpcNumber, error: rpcErr } = await supabase.rpc('generate_invoice_number', { org_id: orgId })
  if (rpcErr || !rpcNumber) {
    console.error('generate_invoice_number RPC failed, using fallback:', rpcErr?.message)
    invoice_number = 'INV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-4)
  } else {
    invoice_number = rpcNumber
  }

  const amountPaid = depositCredit
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      invoice_number,
      customer_id,
      payee_id,
      aircraft_id,
      work_order_id,
      estimate_id,
      thread_id,
      source_type: sourceType,
      source_id,
      status,
      payment_status: amountPaid > 0 ? 'partial' : 'unpaid',
      issue_date: body.issue_date ?? today,
      due_date: dueDate,
      subtotal: totals.subtotal,
      tax_rate: Number(body.tax_rate ?? 0),
      tax_amount: totals.tax_amount,
      fees_total: totals.fees_total,
      discount_amount: totals.discount_amount,
      deposit_credit_total: depositCredit,
      payment_total: amountPaid,
      total: totals.total,
      amount_paid: amountPaid,
      notes: body.notes ?? null,
      internal_notes: body.internal_notes ?? null,
      payment_terms: body.payment_terms ?? body.terms ?? 'Net 30',
      terms: body.terms ?? body.payment_terms ?? 'Net 30',
      memo: body.memo ?? null,
      manual_bypass_reason: body.manual_bypass_reason ?? null,
      created_by: ctx.user.id,
      source_context: {
        source_type: sourceType,
        source_descriptor: sourceDescriptor,
        launch_route: body.launch_route ?? null,
        source_context: body.source_context ?? null,
      },
    })
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((li, idx) => ({
      invoice_id: invoice.id,
      organization_id: orgId,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      item_type: li.item_type,
      work_order_line_id: li.work_order_line_id ?? null,
      sort_order: li.sort_order ?? idx,
      source_type: li.source_type ?? 'manual',
      source_id: li.source_id ?? null,
      source_label: li.source_label ?? 'Manual',
      tax_category: li.tax_category ?? null,
      billable: li.billable !== false,
      owner_visible: li.owner_visible !== false,
      approved_for_billing: li.approved_for_billing !== false,
      linked_task_id: li.linked_task_id ?? null,
      linked_part_id: li.linked_part_id ?? null,
      linked_labor_id: li.linked_labor_id ?? null,
      ...buildClassificationPatch(li.taxonomy ?? li),
    }))

    const { error: lineErr } = await supabase.from('invoice_line_items').insert(itemsToInsert)
    if (lineErr) console.error('Failed to insert invoice line items:', lineErr.message)
  }

  if (depositCredit > 0 && estimate_id) {
    await applyDepositCredit(supabase, orgId, invoice.id, estimate_id, aircraft_id, payee_id ?? customer_id, depositCredit, ctx.user.id)
  }

  if (work_order_id) {
    await supabase
      .from('work_orders')
      .update({ linked_invoice_id: invoice.id, updated_at: new Date().toISOString() })
      .eq('id', work_order_id)
      .eq('organization_id', orgId)
  }

  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: 'invoice_created',
    invoiceId: invoice.id,
    aircraftId: aircraft_id,
    metadata: { source_type: sourceType, source_id, line_count: lineItems.length, deposit_credit: depositCredit },
  })

  await writeInvoiceTimeline(supabase, {
    organizationId: orgId,
    aircraftId: aircraft_id,
    actorId: ctx.user.id,
    action: 'created',
    invoiceId: invoice.id,
    title: `Invoice ${invoice.invoice_number} created`,
    summary: `${sourceDescriptor}. Balance due $${Number(invoice.balance_due ?? totals.total - amountPaid).toFixed(2)}.`,
    ownerVisible: false,
    metadata: { source_type: sourceType, source_id, total: totals.total, deposit_credit: depositCredit },
  })

  const { data: fullInvoice } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email),
      payee:payee_id (id, name, email),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status),
      estimate:estimate_id (id, estimate_number, status)
    `)
    .eq('id', invoice.id)
    .single()

  return NextResponse.json(fullInvoice ?? invoice, { status: 201 })
}

function normalizeSourceType(value: unknown) {
  const normalized = String(value ?? 'manual').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'wo') return 'work_order'
  if (normalized === 'workorder') return 'work_order'
  if (normalized === 'custom_manual') return 'custom'
  if (['work_order', 'aircraft', 'estimate', 'custom', 'manual'].includes(normalized)) return normalized
  return 'manual'
}

async function findEstimateForWorkOrder(supabase: any, orgId: string, workOrderId: string) {
  const { data } = await supabase
    .from('estimates')
    .select('id')
    .eq('organization_id', orgId)
    .or(`converted_work_order_id.eq.${workOrderId},linked_work_order_id.eq.${workOrderId}`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

async function collectAvailableDepositCredit(supabase: any, orgId: string, estimateId: string) {
  const { data } = await supabase
    .from('deposit_payments')
    .select('amount')
    .eq('organization_id', orgId)
    .eq('estimate_id', estimateId)
    .in('status', ['paid', 'verified'])
    .is('applies_to_invoice_id', null)

  return (data ?? []).reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0)
}

async function applyDepositCredit(
  supabase: any,
  orgId: string,
  invoiceId: string,
  estimateId: string,
  aircraftId: string | null,
  ownerId: string | null,
  amount: number,
  userId: string
) {
  const paymentDate = new Date().toISOString().split('T')[0]
  await supabase.from('payments').insert({
    organization_id: orgId,
    invoice_id: invoiceId,
    aircraft_id: aircraftId,
    owner_id: ownerId,
    amount,
    payment_method: 'deposit_credit',
    reference_number: estimateId,
    manual_reference: estimateId,
    notes: 'Deposit credit applied from approved estimate.',
    recorded_by: userId,
    received_by: userId,
    payment_date: paymentDate,
    received_at: new Date().toISOString(),
    status: 'verified',
    verification_status: 'verified',
    verified_by: userId,
    verified_at: new Date().toISOString(),
    metadata: { estimate_id: estimateId, credit_type: 'deposit' },
  })

  await supabase
    .from('deposit_payments')
    .update({ applies_to_invoice_id: invoiceId, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('estimate_id', estimateId)
    .in('status', ['paid', 'verified'])
    .is('applies_to_invoice_id', null)
}
