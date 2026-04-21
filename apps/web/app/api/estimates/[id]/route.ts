import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

function normalizeEstimateStatus(value: unknown): string {
  if (typeof value !== 'string') return 'draft'
  const normalized = value.trim().toLowerCase()
  if (['draft', 'sent', 'approved', 'rejected', 'converted'].includes(normalized)) {
    return normalized
  }
  return 'draft'
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data, error } = await supabase
    .from('estimates')
    .select(
      `
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      customer:customer_id (id, name, email, company),
      line_items:estimate_line_items (*)
    `
    )
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (Array.isArray((data as any).line_items)) {
    ;((data as any).line_items as any[]).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()
  const allowedFields = [
    'assumptions',
    'internal_notes',
    'customer_notes',
    'valid_until',
    'linked_work_order_id',
    'mechanic_name',
    'service_type',
    'customer_id',
    'aircraft_id',
    'linked_squawk_ids',
    'ai_summary',
    'ai_summary_generated_at',
  ]
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if ('status' in body) {
    updates.status = normalizeEstimateStatus(body.status)
  }

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  const { data, error } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { data: estimate } = await supabase
    .from('estimates')
    .select('status')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!estimate) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['draft', 'rejected'].includes(estimate.status)) {
    return NextResponse.json({ error: 'Only draft or rejected estimates can be deleted' }, { status: 409 })
  }

  await supabase
    .from('estimate_line_items')
    .delete()
    .eq('estimate_id', params.id)
    .eq('organization_id', orgId)

  const { error } = await supabase
    .from('estimates')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
