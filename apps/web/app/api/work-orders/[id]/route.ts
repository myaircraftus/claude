import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgId(supabase: ReturnType<typeof import('@/lib/supabase/server').createServerSupabase>, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

async function recalculateTotals(
  supabase: ReturnType<typeof import('@/lib/supabase/server').createServerSupabase>,
  workOrderId: string
) {
  const { data: lines } = await supabase
    .from('work_order_lines')
    .select('line_type, line_total')
    .eq('work_order_id', workOrderId)

  const labor_total = (lines ?? [])
    .filter(l => l.line_type === 'labor')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const parts_total = (lines ?? [])
    .filter(l => l.line_type === 'part')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const outside_services_total = (lines ?? [])
    .filter(l => l.line_type === 'outside_service')
    .reduce((s, l) => s + (l.line_total ?? 0), 0)
  const total = labor_total + parts_total + outside_services_total

  await supabase
    .from('work_orders')
    .update({ labor_total, parts_total, outside_services_total, total, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      lines:work_order_lines (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sort lines by sort_order
  if (data.lines) {
    data.lines.sort((a: any, b: any) => a.sort_order - b.sort_order)
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
  const allowedFields = [
    'status', 'customer_complaint', 'discrepancy', 'troubleshooting_notes', 'findings',
    'corrective_action', 'internal_notes', 'customer_notes',
    'assigned_mechanic_id', 'aircraft_id', 'tax_amount',
    'closed_at',
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  // Map frontend field names to DB column names
  if ('complaint' in body) body.customer_complaint = body.complaint
  if ('customer_visible_notes' in body) body.customer_notes = body.customer_visible_notes
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  // Auto-set timestamps based on status
  if (body.status === 'closed' && !updates.closed_at) updates.closed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('work_orders')
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

  // Only allow deleting draft or archived work orders
  const { data: wo } = await supabase
    .from('work_orders')
    .select('status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['draft', 'archived'].includes(wo.status)) {
    return NextResponse.json({ error: 'Only draft or archived work orders can be deleted' }, { status: 409 })
  }

  const { error } = await supabase
    .from('work_orders')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
