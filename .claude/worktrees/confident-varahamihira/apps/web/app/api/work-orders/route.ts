import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// GET /api/work-orders — list for org
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const aircraftId = searchParams.get('aircraft_id')

  let query = supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, customer_complaint, labor_total, parts_total, outside_services_total, total,
      opened_at, closed_at, internal_notes, customer_notes,
      aircraft:aircraft_id(id, tail_number, make, model),
      mechanic:assigned_mechanic_id(id, email, user_profiles(full_name))
    `)
    .eq('organization_id', membership.organization_id)
    .order('opened_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') query = query.eq('status', status)
  if (aircraftId) query = query.eq('aircraft_id', aircraftId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Flatten mechanic name for Kanban
  const workOrders = (data ?? []).map((wo: any) => ({
    ...wo,
    // Normalize to component-expected names
    complaint: wo.customer_complaint,
    total_amount: wo.total,
    customer_visible_notes: wo.customer_notes,
    mechanic_name: wo.mechanic?.user_profiles?.full_name ?? wo.mechanic?.email ?? null,
  }))
  return NextResponse.json({ workOrders })
}

// POST /api/work-orders — create
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    aircraft_id?: string
    assigned_mechanic_id?: string
    complaint?: string
    internal_notes?: string
  }

  // Generate work order number: WO-YYYY-NNNN
  const year = new Date().getFullYear()
  const service = createServiceSupabase()
  const { count } = await service
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const workOrderNumber = `WO-${year}-${seq}`

  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      organization_id: membership.organization_id,
      work_order_number: workOrderNumber,
      aircraft_id: body.aircraft_id ?? null,
      assigned_mechanic_id: body.assigned_mechanic_id ?? user.id,
      customer_complaint: body.complaint ?? null,
      internal_notes: body.internal_notes ?? null,
      status: 'open',
    })
    .select('id, work_order_number')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Default labor line
  await supabase.from('work_order_lines').insert({
    work_order_id: data.id,
    organization_id: membership.organization_id,
    line_type: 'labor',
    description: 'Labor — inspection & repair',
    quantity: 0,
    unit_price: 125,
    hours: 0,
    rate: 125,
    sort_order: 0,
  })

  return NextResponse.json(data)
}
