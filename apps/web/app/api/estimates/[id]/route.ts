import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

function normalizeEstimateStatus(value: unknown): string {
  if (typeof value !== 'string') return 'draft'
  const normalized = value.trim().toLowerCase()
  if (['draft', 'sent', 'approved', 'rejected', 'converted'].includes(normalized)) {
    return normalized
  }
  return 'draft'
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

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

  const squawkIds: string[] = Array.isArray((data as any).linked_squawk_ids)
    ? ((data as any).linked_squawk_ids as string[])
    : []
  if (squawkIds.length > 0) {
    const { data: linkedSquawks } = await supabase
      .from('squawks')
      .select('id, title, description, severity')
      .in('id', squawkIds)
    ;(data as any).linked_squawks = linkedSquawks ?? []
  } else {
    ;(data as any).linked_squawks = []
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

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
