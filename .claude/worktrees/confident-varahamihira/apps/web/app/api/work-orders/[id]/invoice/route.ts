import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// POST /api/work-orders/[id]/invoice — generate invoice and mark WO as invoiced
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load work order with lines
  const { data: wo, error: woError } = await supabase
    .from('work_orders')
    .select(`
      *,
      aircraft:aircraft_id(tail_number, make, model, year),
      lines:work_order_lines(*)
    `)
    .eq('id', params.id)
    .single()

  if (woError || !wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { notes?: string }
  const now = new Date().toISOString()

  // Mark work order as invoiced
  await supabase
    .from('work_orders')
    .update({
      status: 'invoiced',
      updated_at: now,
    })
    .eq('id', params.id)

  // Build invoice data object (for PDF generation or display)
  const lines = (wo.lines ?? []) as Array<{
    line_type: string
    description: string
    quantity: number
    unit_price: number
    line_total: number
    hours?: number
    rate?: number
    part_number?: string
    vendor?: string
  }>

  const laborLines = lines.filter(l => l.line_type === 'labor')
  const partLines = lines.filter(l => l.line_type === 'part')
  const outsideLines = lines.filter(l => l.line_type === 'outside_service')

  const invoice = {
    work_order_id: params.id,
    work_order_number: (wo as any).work_order_number,
    invoiced_at: now,
    aircraft: (wo as any).aircraft,
    complaint: (wo as any).customer_complaint,
    labor_lines: laborLines.map(l => ({
      description: l.description,
      hours: l.hours ?? l.quantity,
      rate: l.rate ?? l.unit_price,
      amount: l.hours && l.rate ? l.hours * l.rate : l.line_total,
    })),
    part_lines: partLines.map(l => ({
      part_number: l.part_number,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      amount: l.line_total,
      vendor: l.vendor,
    })),
    outside_lines: outsideLines.map(l => ({
      description: l.description,
      amount: l.line_total,
    })),
    labor_total: (wo as any).labor_total,
    parts_total: (wo as any).parts_total,
    outside_total: (wo as any).outside_services_total,
    tax_amount: (wo as any).tax_amount ?? 0,
    total_amount: (wo as any).total,
    customer_notes: body.notes ?? (wo as any).customer_notes ?? null,
    payment_status: 'pending',
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    organization_id: (wo as any).organization_id,
    user_id: user.id,
    action: 'work_order.invoiced',
    entity_type: 'work_order',
    entity_id: params.id,
    metadata_json: {
      work_order_number: (wo as any).work_order_number,
      total_amount: (wo as any).total_amount,
    },
  })

  return NextResponse.json({ ok: true, invoice })
}
