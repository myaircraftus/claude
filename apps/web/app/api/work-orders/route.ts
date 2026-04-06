import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const aircraft_id = searchParams.get('aircraft_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, customer_complaint, labor_total, parts_total,
      outside_services_total, tax_amount, total, opened_at, closed_at,
      created_at, updated_at, aircraft_id, assigned_mechanic_id,
      aircraft:aircraft_id (id, tail_number, make, model)
    `, { count: 'exact' })
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ work_orders: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const orgId = membership.organization_id
  const body = await req.json()

  // Generate work order number: WO-YYYY-NNNN
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const work_order_number = `WO-${year}-${seq}`

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      organization_id: orgId,
      work_order_number,
      aircraft_id: body.aircraft_id ?? null,
      status: body.status ?? 'open',
      customer_complaint: body.complaint ?? null,
      assigned_mechanic_id: body.assigned_mechanic_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
