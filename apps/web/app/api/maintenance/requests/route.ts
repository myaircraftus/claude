import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId
  const role = ctx.role

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const aircraft_id = searchParams.get('aircraft_id')

  let query = supabase
    .from('maintenance_requests')
    .select(`
      id, aircraft_id, requester_user_id, target_mechanic_user_id,
      message, squawk_ids, status, created_work_order_id, request_source,
      source_reminder_id, source_summary,
      created_at, responded_at,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      source_reminder:source_reminder_id (id, title, reminder_type)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  // Role-based filtering: mechanics see requests targeted at them, pilots see their own
  if (role === 'mechanic') {
    query = query.eq('target_mechanic_user_id', user.id)
  } else if (role === 'pilot') {
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
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId

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
      organization_id: orgId,
      aircraft_id: body.aircraft_id,
      requester_user_id: user.id,
      target_mechanic_user_id: body.target_mechanic_user_id,
      message: body.message ?? null,
      squawk_ids: body.squawk_ids ?? [],
      request_source: body.request_source ?? 'general',
      source_reminder_id: body.source_reminder_id ?? null,
      source_summary: body.source_summary ?? null,
    })
    .select(`
      *,
      requester:requester_user_id (id, full_name, email, avatar_url),
      mechanic:target_mechanic_user_id (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      source_reminder:source_reminder_id (id, title, reminder_type)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
