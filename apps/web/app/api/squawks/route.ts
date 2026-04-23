import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const aircraft_id = searchParams.get('aircraft_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('squawks')
    .select(`
      id, aircraft_id, title, description, severity, status, source,
      source_metadata, assigned_work_order_id, reported_at, resolved_at,
      created_at, updated_at,
      reporter:reported_by (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model)
    `, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)
  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ squawks: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId

  const body = await req.json()

  if (!body.aircraft_id || !body.title) {
    return NextResponse.json({ error: 'aircraft_id and title are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('squawks')
    .insert({
      organization_id: orgId,
      aircraft_id: body.aircraft_id,
      reported_by: user.id,
      title: body.title,
      description: body.description ?? null,
      severity: body.severity ?? 'normal',
      source: body.source ?? 'manual',
      source_metadata: body.source_metadata ?? {},
      reported_at: new Date().toISOString(),
    })
    .select(`
      *,
      reporter:reported_by (id, full_name, email, avatar_url)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
