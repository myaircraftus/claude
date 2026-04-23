import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

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
      customer:customer_id (id, name, email, phone, billing_address),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sort line items
  if (data.line_items) {
    (data.line_items as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
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
    .select('subtotal, tax_rate, tax_amount, discount_amount, total')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const allowedFields = [
    'status', 'due_date', 'tax_rate', 'tax_amount', 'discount_amount',
    'notes', 'internal_notes', 'invoice_date', 'payment_terms',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  // Recalculate total if tax or discount changed
  const subtotal = current.subtotal
  const taxRate = (updates.tax_rate ?? current.tax_rate) as number
  const taxAmount = 'tax_amount' in updates
    ? updates.tax_amount as number
    : Math.round(subtotal * taxRate) / 100
  const discountAmount = (updates.discount_amount ?? current.discount_amount ?? 0) as number
  const total = subtotal + (taxAmount as number) - discountAmount

  updates.tax_amount = taxAmount
  updates.total = total

  // Handle status transitions
  if (body.status === 'void') updates.voided_at = new Date().toISOString()
  if (body.status === 'paid') updates.paid_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
