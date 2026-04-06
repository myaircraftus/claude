import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

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
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const aircraft_id = searchParams.get('aircraft_id')

  let query = supabase
    .from('maintenance_requests')
    .select(`
      id, aircraft_id, requester_user_id, target_mechanic_user_id,
      message, squawk_ids, status, created_work_order_id,
      created_at, responded_at,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model)
    `, { count: 'exact' })
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })

  // Role-based filtering: mechanics see requests targeted at them, pilots see their own
  if (membership.role === 'mechanic') {
    query = query.eq('target_mechanic_user_id', user.id)
  } else if (membership.role === 'pilot') {
    query = query.eq('requester_user_id', user.id)
  }
  // owner/admin/auditor see all org requests

  if (status) query = query.eq('status', status)
  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data ?? [], total: count ?? 0 })
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

  const body = await req.json()

  if (!body.aircraft_id || !body.target_mechanic_user_id) {
    return NextResponse.json(
      { error: 'aircraft_id and target_mechanic_user_id are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('maintenance_requests')
    .insert({
      organization_id: membership.organization_id,
      aircraft_id: body.aircraft_id,
      requester_user_id: user.id,
      target_mechanic_user_id: body.target_mechanic_user_id,
      message: body.message ?? null,
      squawk_ids: body.squawk_ids ?? [],
    })
    .select(`
      *,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
