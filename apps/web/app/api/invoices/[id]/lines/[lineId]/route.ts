import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildClassificationPatch } from '@/lib/taxonomy/format'
import { calculateInvoiceTotals, normalizeInvoiceLineType, paymentStatusForTotals, writeInvoiceAudit } from '@/lib/invoices/workflow'

async function recalculateInvoiceTotals(supabase: any, invoiceId: string, orgId: string) {
  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('quantity, unit_price')
    .eq('invoice_id', invoiceId)
    .eq('organization_id', orgId)

  const subtotal = (lines ?? []).reduce((sum: number, l: any) => sum + (l.quantity * l.unit_price), 0)

  const { data: invoice } = await supabase
    .from('invoices')
    .select('tax_rate, discount_amount, fees_total, amount_paid, due_date')
    .eq('id', invoiceId)
    .single()

  if (!invoice) return

  const totals = calculateInvoiceTotals({
    subtotal,
    taxRate: invoice.tax_rate ?? 0,
    discountAmount: invoice.discount_amount ?? 0,
    feesTotal: invoice.fees_total ?? 0,
  })

  await supabase
    .from('invoices')
    .update({
      subtotal,
      tax_amount: totals.tax_amount,
      total: totals.total,
      payment_status: paymentStatusForTotals(totals.total, Number(invoice.amount_paid ?? 0), invoice.due_date).paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('organization_id', orgId)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()
  const allowedFields = [
    'description', 'quantity', 'unit_price', 'item_type', 'sort_order',
    'ata_code', 'jasc_code', 'classification_source',
    'classification_confidence', 'classification_status',
    'source_type', 'source_id', 'source_label', 'tax_category',
    'billable', 'owner_visible', 'approved_for_billing',
    'linked_task_id', 'linked_part_id', 'linked_labor_id',
  ]
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }
  if ('item_type' in updates) updates.item_type = normalizeInvoiceLineType(updates.item_type)
  Object.assign(updates, buildClassificationPatch(body))

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('invoice_line_items')
    .update(updates)
    .eq('id', params.lineId)
    .eq('invoice_id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateInvoiceTotals(supabase, params.id, orgId)
  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: 'invoice_line_updated',
    invoiceId: params.id,
    metadata: { line_id: params.lineId },
  })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', params.lineId)
    .eq('invoice_id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateInvoiceTotals(supabase, params.id, orgId)
  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: 'invoice_line_deleted',
    invoiceId: params.id,
    metadata: { line_id: params.lineId },
  })
  return NextResponse.json({ deleted: true })
}
