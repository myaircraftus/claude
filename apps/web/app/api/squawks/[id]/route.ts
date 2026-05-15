import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  buildSquawkTaxonomyPatch,
  normalizeSquawkSeverity,
  normalizeSquawkStatus,
  resolutionTypeForStatus,
  SQUAWK_CLOSURE_STATUSES,
  writeSquawkAudit,
  writeSquawkTimeline,
} from '@/lib/squawks/workflow'

const SQUAWK_DETAIL_SELECT = `
  *,
  reporter:reported_by (id, full_name, email, avatar_url),
  aircraft:aircraft_id (id, tail_number, make, model),
  work_order:assigned_work_order_id (id, work_order_number, status),
  estimate:linked_estimate_id (id, estimate_number, status),
  evidence:squawk_evidence (*),
  ai_drafts:squawk_ai_drafts (*),
  routes:squawk_routes (*),
  status_history:squawk_status_history (*),
  owner_projection:squawk_owner_visibility (*),
  resolutions:squawk_resolutions (*)
`

const MATERIAL_FIELDS = new Set([
  'title',
  'description',
  'category',
  'severity',
  'status',
  'owner_visible',
  'owner_summary',
  'internal_notes',
  'assigned_work_order_id',
  'linked_estimate_id',
  'current_route_type',
])

function compactString(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('squawks')
    .select(SQUAWK_DETAIL_SELECT)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId
  const userId = ctx.user.id

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('squawks')
    .select('id, aircraft_id, title, description, severity, status, owner_visible, assigned_work_order_id, linked_estimate_id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reason = compactString((body as any).edit_reason ?? (body as any).reason ?? (body as any).closure_reason)
  const hasMaterialEdit = Object.keys(body as Record<string, unknown>).some((key) => MATERIAL_FIELDS.has(key))
  if (hasMaterialEdit && !reason) {
    return NextResponse.json({ error: 'Edit reason is required for squawk changes' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const directFields = [
    'title',
    'description',
    'category',
    'owner_visible',
    'owner_summary',
    'internal_notes',
    'current_route_type',
    'assigned_work_order_id',
    'linked_estimate_id',
    'linked_task_id',
    'linked_checklist_item_id',
    'closure_reason',
    'closure_notes',
    'duplicate_of_squawk_id',
    'suggested_ata_code',
    'suggested_jasc_code',
    'confirmed_ata_code',
    'confirmed_jasc_code',
    'classification_source',
    'classification_confidence',
    'classification_status',
  ]

  for (const field of directFields) {
    if (field in (body as any)) updates[field] = (body as any)[field]
  }
  if ('severity' in (body as any)) updates.severity = normalizeSquawkSeverity((body as any).severity)
  if ('status' in (body as any)) updates.status = normalizeSquawkStatus((body as any).status)
  if ((body as any).human_verified || (body as any).verified) {
    updates.verified_by_user_id = userId
    updates.verified_at = new Date().toISOString()
  }
  Object.assign(updates, buildSquawkTaxonomyPatch(body as Record<string, unknown>))

  const nextStatus = typeof updates.status === 'string' ? updates.status : existing.status
  if (SQUAWK_CLOSURE_STATUSES.has(nextStatus) || nextStatus === 'deferred') {
    if (!reason) {
      return NextResponse.json({ error: 'Closure or deferral reason is required' }, { status: 400 })
    }
    updates.resolved_at = nextStatus === 'deferred' ? null : new Date().toISOString()
    updates.closure_reason = reason
    if ('closure_notes' in (body as any)) updates.closure_notes = (body as any).closure_notes
  }

  const { data, error } = await supabase
    .from('squawks')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .select(SQUAWK_DETAIL_SELECT)
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update squawk' }, { status: 500 })

  if (nextStatus !== existing.status) {
    await supabase.from('squawk_status_history').insert({
      organization_id: orgId,
      squawk_id: params.id,
      from_status: existing.status,
      to_status: nextStatus,
      reason,
      notes: compactString((body as any).notes ?? (body as any).closure_notes),
      actor_id: userId,
    })
  }

  if (SQUAWK_CLOSURE_STATUSES.has(nextStatus) || nextStatus === 'deferred') {
    await supabase.from('squawk_resolutions').insert({
      organization_id: orgId,
      squawk_id: params.id,
      resolution_type: resolutionTypeForStatus(nextStatus, reason),
      linked_work_order_id: (body as any).assigned_work_order_id ?? data.assigned_work_order_id ?? null,
      linked_estimate_id: (body as any).linked_estimate_id ?? data.linked_estimate_id ?? null,
      duplicate_of_squawk_id: (body as any).duplicate_of_squawk_id ?? null,
      notes: compactString((body as any).closure_notes ?? reason),
      attachments: (body as any).attachments ?? [],
      resolved_by: userId,
    })
  }

  if ('owner_visible' in (body as any) || 'owner_summary' in (body as any)) {
    await supabase.from('squawk_owner_visibility').upsert({
      organization_id: orgId,
      squawk_id: params.id,
      owner_visible: Boolean(data.owner_visible),
      sanitized_title: data.title,
      sanitized_description: data.owner_summary ?? data.description,
      visible_fields: (body as any).owner_visible_fields ?? ['title', 'description', 'status'],
      updated_by: userId,
    }, { onConflict: 'squawk_id' })
  }

  await writeSquawkAudit(supabase, req, {
    organizationId: orgId,
    userId,
    action: nextStatus !== existing.status ? 'squawk.status_changed' : 'squawk.updated',
    squawkId: params.id,
    aircraftId: data.aircraft_id,
    metadata: {
      reason,
      before_status: existing.status,
      after_status: nextStatus,
      owner_visible: data.owner_visible,
    },
  })

  await writeSquawkTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: userId,
    action: nextStatus !== existing.status ? 'squawk.status_changed' : 'squawk.updated',
    squawkId: params.id,
    title: nextStatus !== existing.status ? `Squawk ${nextStatus.replace(/_/g, ' ')}` : `Squawk updated: ${data.title}`,
    summary: reason,
    ownerVisible: data.owner_visible,
    metadata: {
      before_status: existing.status,
      after_status: nextStatus,
    },
  })

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json(
    {
      error:
        'Squawks are discrepancy records and cannot be hard-deleted. Close or archive the squawk with a reason so the audit trail is preserved.',
      squawk_id: params.id,
    },
    { status: 409 }
  )
}
