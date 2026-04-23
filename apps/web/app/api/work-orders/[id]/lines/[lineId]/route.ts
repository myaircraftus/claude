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

export async function PATCH(req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()
  const allowedFields = [
    'line_type', 'description', 'quantity', 'unit_price', 'part_number',
    'serial_number_removed', 'serial_number_installed', 'vendor', 'condition',
    'status', 'hours', 'rate', 'notes', 'sort_order',
  ]
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  const { data, error } = await supabase
    .from('work_order_lines')
    .update(updates)
    .eq('id', params.lineId)
    .eq('work_order_id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateTotals(supabase, params.id)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; lineId: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { error } = await supabase
    .from('work_order_lines')
    .delete()
    .eq('id', params.lineId)
    .eq('work_order_id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalculateTotals(supabase, params.id)
  return NextResponse.json({ deleted: true })
}
