import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const customer_id = searchParams.get('customer_id')
  const work_order_id = searchParams.get('work_order_id')
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('invoices')
    .select(`
      id, invoice_number, status, invoice_date, due_date,
      subtotal, tax_rate, tax_amount, total,
      amount_paid, balance_due, notes,
      sent_at, paid_at, created_at,
      customer_id, aircraft_id, work_order_id,
      customer:customer_id (id, name, email),
      aircraft:aircraft_id (id, tail_number)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)
  if (customer_id) query = query.eq('customer_id', customer_id)
  if (work_order_id) query = query.eq('work_order_id', work_order_id)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()

  let customer_id = body.customer_id ?? null
  let aircraft_id = body.aircraft_id ?? null
  let work_order_id = body.work_order_id ?? null
  let thread_id = body.thread_id ?? null
  const lineItems: any[] = []

  // If work_order_id provided, auto-populate from WO
  if (work_order_id) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select(`
        id, aircraft_id, customer_id, thread_id,
        lines:work_order_lines (*)
      `)
      .eq('id', work_order_id)
      .eq('organization_id', orgId)
      .single()

    if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    customer_id = customer_id || wo.customer_id
    aircraft_id = aircraft_id || wo.aircraft_id
    thread_id = thread_id || wo.thread_id

    // Convert WO lines to invoice line items
    const woLines = ((wo as any).lines ?? []) as any[]
    woLines.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    woLines.forEach((line: any, idx: number) => {
      if (line.line_type === 'note' || line.line_type === 'discrepancy') return

      let item_type = line.line_type
      if (item_type === 'labor') item_type = 'labor'
      else if (item_type === 'part') item_type = 'part'
      else if (item_type === 'outside_service') item_type = 'outside_service'
      else item_type = 'service'

      lineItems.push({
        description: line.description,
        quantity: line.quantity ?? 1,
        unit_price: line.unit_price ?? 0,
        item_type,
        work_order_line_id: line.id,
        sort_order: idx,
      })
    })
  }

  // Calculate subtotal from line items
  const subtotal = lineItems.reduce((sum, li) => sum + (li.quantity * li.unit_price), 0)
  const tax_rate = body.tax_rate ?? 0
  const tax_amount = Math.round(subtotal * tax_rate) / 100
  const discount_amount = body.discount_amount ?? 0
  const total = subtotal + tax_amount - discount_amount

  const today = new Date().toISOString().split('T')[0]
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Generate invoice number via DB function, with client-side fallback
  let invoice_number: string
  const { data: rpcNumber, error: rpcErr } = await supabase
    .rpc('generate_invoice_number', { org_id: orgId })
  if (rpcErr || !rpcNumber) {
    console.error('generate_invoice_number RPC failed, using fallback:', rpcErr?.message)
    invoice_number = 'INV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-4)
  } else {
    invoice_number = rpcNumber
  }

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      organization_id: orgId,
      invoice_number,
      customer_id,
      aircraft_id,
      work_order_id,
      thread_id,
      status: 'draft',
      invoice_date: today,
      due_date: dueDate,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total,
      amount_paid: 0,
      balance_due: total,
      notes: body.notes ?? null,
      internal_notes: body.internal_notes ?? null,
      payment_terms: body.payment_terms ?? 'Net 30',
    })
    .select()
    .single()

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })

  // Insert line items
  if (lineItems.length > 0) {
    const itemsToInsert = lineItems.map((li) => ({
      invoice_id: invoice.id,
      organization_id: orgId,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      item_type: li.item_type,
      work_order_line_id: li.work_order_line_id ?? null,
      sort_order: li.sort_order,
    }))

    const { error: lineErr } = await supabase
      .from('invoice_line_items')
      .insert(itemsToInsert)

    if (lineErr) {
      console.error('Failed to insert line items:', lineErr.message)
    }
  }

  // Fetch complete invoice with line items
  const { data: fullInvoice } = await supabase
    .from('invoices')
    .select(`
      *,
      line_items:invoice_line_items (*),
      customer:customer_id (id, name, email),
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('id', invoice.id)
    .single()

  return NextResponse.json(fullInvoice ?? invoice, { status: 201 })
}
