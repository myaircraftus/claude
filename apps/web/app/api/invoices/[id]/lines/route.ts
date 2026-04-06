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

async function recalculateInvoiceTotals(supabase: any, invoiceId: string, orgId: string) {
  const { data: lines } = await supabase
    .from('invoice_line_items')
    .select('quantity, unit_price')
    .eq('invoice_id', invoiceId)
    .eq('organization_id', orgId)

  const subtotal = (lines ?? []).reduce((sum: number, l: any) => sum + (l.quantity * l.unit_price), 0)

  const { data: invoice } = await supabase
    .from('invoices')
    .select('tax_rate, discount_amount, amount_paid')
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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

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
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

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
      item_type: body.item_type ?? 'service',
      work_order_line_id: body.work_order_line_id ?? null,
      sort_order,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateInvoiceTotals(supabase, params.id, orgId)
  return NextResponse.json(data, { status: 201 })
}
