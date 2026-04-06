import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgId(supabase: ReturnType<typeof createServerSupabase>, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await supabase
    .from('squawks')
    .select(`
      *,
      reporter:reported_by (id, full_name, email, avatar_url),
      aircraft:aircraft_id (id, tail_number, make, model),
      work_order:assigned_work_order_id (id, work_order_number, status)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()
  const allowedFields = ['title', 'description', 'severity', 'status', 'assigned_work_order_id']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  // Auto-set resolved_at when status changes to resolved
  if (body.status === 'resolved') {
    updates.resolved_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('squawks')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select(`
      *,
      reporter:reported_by (id, full_name, email, avatar_url)
    `)
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

  // Only allow deleting open squawks
  const { data: squawk } = await supabase
    .from('squawks')
    .select('status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!squawk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (squawk.status !== 'open') {
    return NextResponse.json(
      { error: 'Only open squawks can be deleted' },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('squawks')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
