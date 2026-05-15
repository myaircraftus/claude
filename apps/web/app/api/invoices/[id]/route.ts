import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  calculateInvoiceTotals,
  normalizeInvoiceStatus,
  paymentStatusForTotals,
  writeInvoiceAudit,
  writeInvoiceTimeline,
} from '@/lib/invoices/workflow'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      payments (*),
      share_events:invoice_share_events (*),
      receipts:invoice_receipts (*),
      versions:invoice_versions (*),
      customer:customer_id (id, name, email, phone, billing_address),
      payee:payee_id (id, name, email, phone, billing_address),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status),
      estimate:estimate_id (id, estimate_number, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sort line items
  if (data.line_items) {
    (data.line_items as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }
  if (data.payments) {
    (data.payments as any[]).sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()

  // Fetch current invoice for recalculation
  const { data: current } = await supabase
    .from('invoices')
    .select('id, invoice_number, aircraft_id, customer_id, payee_id, subtotal, tax_rate, tax_amount, discount_amount, fees_total, total, amount_paid, due_date, status, version')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowedFields = [
    'status', 'due_date', 'tax_rate', 'tax_amount', 'discount_amount',
    'notes', 'internal_notes', 'payment_terms', 'terms', 'memo',
    'source_type', 'source_id', 'customer_id', 'payee_id', 'fees_total',
    'manual_bypass_reason', 'approval_status',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }
  if ('invoice_date' in body) updates.issue_date = body.invoice_date
  if ('issue_date' in body) updates.issue_date = body.issue_date
  if ('status' in updates) updates.status = normalizeInvoiceStatus(updates.status)

  // Recalculate total if tax or discount changed
  const totals = calculateInvoiceTotals({
    subtotal: Number(current.subtotal ?? 0),
    taxRate: (updates.tax_rate ?? current.tax_rate) as number,
    taxAmount: 'tax_amount' in updates ? updates.tax_amount as number : undefined,
    discountAmount: (updates.discount_amount ?? current.discount_amount ?? 0) as number,
    feesTotal: (updates.fees_total ?? current.fees_total ?? 0) as number,
  })

  updates.tax_amount = totals.tax_amount
  updates.total = totals.total

  if (updates.status === 'paid') {
    updates.amount_paid = totals.total
    updates.payment_total = totals.total
  }
  const paidForStatus = Number(updates.amount_paid ?? current.amount_paid ?? 0)
  if (!('payment_status' in updates)) {
    updates.payment_status = paymentStatusForTotals(totals.total, paidForStatus, (updates.due_date ?? current.due_date) as string | null).paymentStatus
  }

  // Handle status transitions
  if (body.status === 'void') updates.voided_at = new Date().toISOString()
  if (body.status === 'paid') updates.paid_at = new Date().toISOString()
  if (body.sign === true || body.signed_name) {
    updates.signed_by = ctx.user.id
    updates.signed_at = new Date().toISOString()
    updates.signed_name = body.signed_name ?? null
    updates.signed_role = body.signed_role ?? null
    updates.approval_status = 'signed'
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.create_version === true || body.sign === true || body.status === 'paid' || body.status === 'void') {
    const nextVersion = Number(current.version ?? 1) + 1
    await supabase.from('invoice_versions').insert({
      organization_id: orgId,
      invoice_id: params.id,
      version: nextVersion,
      reason: body.version_reason ?? (body.sign ? 'signed invoice' : `status ${body.status}`),
      snapshot: data,
      invoice_hash: body.invoice_hash ?? null,
      created_by: ctx.user.id,
    })
    await supabase
      .from('invoices')
      .update({ version: nextVersion })
      .eq('id', params.id)
      .eq('organization_id', orgId)
  }

  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: body.sign ? 'invoice_signed' : body.status ? 'invoice_status_updated' : 'invoice_updated',
    invoiceId: params.id,
    aircraftId: data.aircraft_id,
    metadata: { before_status: current.status, after_status: data.status },
  })

  await writeInvoiceTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: ctx.user.id,
    action: body.sign ? 'signed' : body.status ? 'status_updated' : 'updated',
    invoiceId: params.id,
    title: `Invoice ${data.invoice_number ?? ''} ${body.sign ? 'signed' : 'updated'}`.trim(),
    summary: body.status ? `Status changed from ${current.status} to ${data.status}.` : null,
    ownerVisible: data.status === 'sent' || data.status === 'paid',
    metadata: { status: data.status, total: data.total, balance_due: data.balance_due },
  })

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Only allow deleting draft invoices
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft invoices can be deleted' }, { status: 409 })
  }

  // Delete line items first
  await supabase
    .from('invoice_line_items')
    .delete()
    .eq('invoice_id', params.id)
    .eq('organization_id', orgId)

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
