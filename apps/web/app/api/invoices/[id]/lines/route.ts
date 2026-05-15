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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', params.id)
    .eq('organization_id', orgId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ line_items: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Verify invoice belongs to org
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const body = await req.json()

  // Get max sort_order
  const { data: maxRow } = await supabase
    .from('invoice_line_items')
    .select('sort_order')
    .eq('invoice_id', params.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()
  const sort_order = body.sort_order ?? ((maxRow?.sort_order ?? -1) + 1)

  const { data, error } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: params.id,
      organization_id: orgId,
      description: body.description ?? '',
      quantity: body.quantity ?? 1,
      unit_price: body.unit_price ?? 0,
      item_type: normalizeInvoiceLineType(body.item_type),
      work_order_line_id: body.work_order_line_id ?? null,
      sort_order,
      source_type: body.source_type ?? 'manual',
      source_id: body.source_id ?? null,
      source_label: body.source_label ?? 'Manual',
      tax_category: body.tax_category ?? null,
      billable: body.billable !== false,
      owner_visible: body.owner_visible !== false,
      approved_for_billing: body.approved_for_billing !== false,
      linked_task_id: body.linked_task_id ?? null,
      linked_part_id: body.linked_part_id ?? null,
      linked_labor_id: body.linked_labor_id ?? null,
      ...buildClassificationPatch(body),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateInvoiceTotals(supabase, params.id, orgId)
  await writeInvoiceAudit(supabase, req, {
    organizationId: orgId,
    userId: ctx.user.id,
    action: 'invoice_line_added',
    invoiceId: params.id,
    metadata: { line_id: data.id, source_type: data.source_type, source_label: data.source_label },
  })
  return NextResponse.json(data, { status: 201 })
}
