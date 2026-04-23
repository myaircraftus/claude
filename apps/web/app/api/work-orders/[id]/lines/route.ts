import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

async function recalculateTotals(supabase: any, workOrderId: string) {
  const { data: lines } = await supabase
    .from('work_order_lines')
    .select('line_type, line_total')
    .eq('work_order_id', workOrderId)

  const labor_total = (lines ?? []).filter((l: any) => l.line_type === 'labor').reduce((s: number, l: any) => s + (l.line_total ?? 0), 0)
  const parts_total = (lines ?? []).filter((l: any) => l.line_type === 'part').reduce((s: number, l: any) => s + (l.line_total ?? 0), 0)
  const outside_services_total = (lines ?? []).filter((l: any) => l.line_type === 'outside_service').reduce((s: number, l: any) => s + (l.line_total ?? 0), 0)
  const total = labor_total + parts_total + outside_services_total

  await supabase
    .from('work_orders')
    .update({ labor_total, parts_total, outside_services_total, total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Verify work order belongs to org
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()

  // Get current max sort_order
  const { data: maxRow } = await supabase
    .from('work_order_lines')
    .select('sort_order')
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()
  const sort_order = ((maxRow?.sort_order ?? -1) + 1)

  const { data, error } = await supabase
    .from('work_order_lines')
    .insert({
      work_order_id: params.id,
      organization_id: orgId,
      line_type: body.line_type ?? 'labor',
      description: body.description ?? '',
      quantity: body.quantity ?? 1,
      unit_price: body.unit_price ?? 0,
      part_number: body.part_number ?? null,
      serial_number_removed: body.serial_number_removed ?? null,
      serial_number_installed: body.serial_number_installed ?? null,
      vendor: body.vendor ?? null,
      condition: body.condition ?? null,
      status: body.status ?? 'pending',
      hours: body.hours ?? null,
      rate: body.rate ?? null,
      notes: body.notes ?? null,
      sort_order,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateTotals(supabase, params.id)
  return NextResponse.json(data, { status: 201 })
}
