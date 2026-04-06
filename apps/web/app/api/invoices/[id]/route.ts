import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email, phone, address_line1, address_line2, city, state, zip),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:work_order_id (id, work_order_number, status),
      payments:payments (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sort line items
  if (data.line_items) {
    (data.line_items as any[]).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  // Sort payments by date
  if (data.payments) {
    (data.payments as any[]).sort((a: any, b: any) =>
      new Date(b.payment_date ?? b.created_at).getTime() - new Date(a.payment_date ?? a.created_at).getTime()
    )
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

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
    'notes', 'internal_notes', 'payment_terms', 'issue_date',
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
  const discountAmount = (updates.discount_amount ?? current.discount_amount) as number
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
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

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
