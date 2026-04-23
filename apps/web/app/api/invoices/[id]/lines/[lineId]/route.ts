import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

async function recalculateInvoiceTotals(supabase: any, invoiceId: string, orgId: string) {
  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('quantity, unit_price')
    .eq('invoice_id', invoiceId)
    .eq('organization_id', orgId)

  const subtotal = (lines ?? []).reduce((sum: number, l: any) => sum + (l.quantity * l.unit_price), 0)

  const { data: invoice } = await supabase
    .from('invoices')
    .select('tax_rate, discount_amount')
    .eq('id', invoiceId)
    .single()

  if (!invoice) return

  const tax_amount = Math.round(subtotal * (invoice.tax_rate ?? 0)) / 100
  const total = subtotal + tax_amount - (invoice.discount_amount ?? 0)

  await supabase
    .from('invoices')
    .update({
      subtotal,
      tax_amount,
      total,
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
  const allowedFields = ['description', 'quantity', 'unit_price', 'item_type', 'sort_order']
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

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
  return NextResponse.json({ deleted: true })
}
