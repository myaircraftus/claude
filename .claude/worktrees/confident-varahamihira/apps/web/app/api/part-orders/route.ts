import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// GET /api/part-orders?org=<id>&status=<status>
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('org')
  const status = searchParams.get('status')

  if (!orgId) return NextResponse.json({ error: 'org required' }, { status: 400 })

  let query = supabase
    .from('part_orders')
    .select('id, part_number, description, vendor, quantity, unit_price, condition, status, notes, created_at, aircraft:aircraft_id(tail_number)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data ?? [] })
}

// POST /api/part-orders
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { organization_id, aircraft_id, part_number, description, vendor, quantity, unit_price, condition, notes, status } = body

  if (!organization_id || !description) {
    return NextResponse.json({ error: 'organization_id and description required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('part_orders')
    .insert({
      organization_id,
      aircraft_id: aircraft_id ?? null,
      part_number: part_number ?? null,
      description,
      vendor: vendor ?? null,
      quantity: quantity ?? 1,
      unit_price: unit_price ?? null,
      condition: condition ?? null,
      notes: notes ?? null,
      status: status ?? 'pending',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ order: data }, { status: 201 })
}
