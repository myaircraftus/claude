import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  resolutionTypeForStatus,
  statusForRoute,
  writeSquawkAudit,
  writeSquawkTimeline,
} from '@/lib/squawks/workflow'

function compactString(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeRouteType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set([
    'existing_work_order',
    'new_work_order',
    'estimate',
    'owner_approval',
    'defer',
    'close',
    'duplicate',
    'no_action',
  ])
  return allowed.has(normalized) ? normalized : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const routeType = normalizeRouteType((body as any).route_type)
  if (!routeType) return NextResponse.json({ error: 'Valid route_type is required' }, { status: 400 })

  const reason = compactString((body as any).reason ?? (body as any).notes)
  if (['defer', 'close', 'duplicate', 'no_action'].includes(routeType) && !reason) {
    return NextResponse.json({ error: 'Reason is required for deferral or closure routes' }, { status: 400 })
  }

  const { data: squawk } = await supabase
    .from('squawks')
    .select('id, aircraft_id, title, status, owner_visible, assigned_work_order_id, linked_estimate_id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .single()

  if (!squawk) return NextResponse.json({ error: 'Squawk not found' }, { status: 404 })

  const targetRecordId =
    compactString((body as any).target_record_id) ??
    compactString((body as any).work_order_id) ??
    compactString((body as any).estimate_id)
  const targetRecordType =
    compactString((body as any).target_record_type) ??
    (routeType.includes('work_order') ? 'work_order' : routeType === 'estimate' ? 'estimate' : null)
  const nextStatus = statusForRoute(routeType, squawk.status)

  const { data: route, error: routeError } = await supabase
    .from('squawk_routes')
    .insert({
      organization_id: ctx.organizationId,
      squawk_id: params.id,
      route_type: routeType,
      target_record_type: targetRecordType,
      target_record_id: targetRecordId,
      notes: reason,
      owner_visible: Boolean((body as any).owner_visible),
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (routeError || !route) {
    return NextResponse.json({ error: routeError?.message ?? 'Failed to route squawk' }, { status: 500 })
  }

  const updates: Record<string, unknown> = {
    status: nextStatus,
    current_route_type: routeType,
    updated_at: new Date().toISOString(),
  }
  if (routeType === 'existing_work_order' || routeType === 'new_work_order') {
    updates.assigned_work_order_id = targetRecordId
  }
  if (routeType === 'estimate') updates.linked_estimate_id = targetRecordId
  if (routeType === 'owner_approval') updates.owner_visible = Boolean((body as any).owner_visible)
  if (['defer', 'close', 'duplicate', 'no_action'].includes(routeType)) {
    updates.closure_reason = reason
    updates.closure_notes = compactString((body as any).closure_notes)
    updates.resolved_at = routeType === 'defer' ? null : new Date().toISOString()
    if (routeType === 'duplicate') updates.duplicate_of_squawk_id = compactString((body as any).duplicate_of_squawk_id)
  }

  const { data: updated, error: updateError } = await supabase
    .from('squawks')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Failed to update squawk route status' }, { status: 500 })
  }

  if (nextStatus !== squawk.status) {
    await supabase.from('squawk_status_history').insert({
      organization_id: ctx.organizationId,
      squawk_id: params.id,
      from_status: squawk.status,
      to_status: nextStatus,
      reason,
      notes: compactString((body as any).notes),
      actor_id: ctx.user.id,
    })
  }

  if (['defer', 'close', 'duplicate', 'no_action'].includes(routeType)) {
    await supabase.from('squawk_resolutions').insert({
      organization_id: ctx.organizationId,
      squawk_id: params.id,
      resolution_type: routeType === 'defer' ? 'deferred' : resolutionTypeForStatus(nextStatus, reason),
      linked_work_order_id: updated.assigned_work_order_id ?? null,
      linked_estimate_id: updated.linked_estimate_id ?? null,
      duplicate_of_squawk_id: compactString((body as any).duplicate_of_squawk_id),
      notes: compactString((body as any).closure_notes ?? reason),
      attachments: (body as any).attachments ?? [],
      resolved_by: ctx.user.id,
    })
  }

  await writeSquawkAudit(supabase, req, {
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    action: 'squawk.routed',
    squawkId: params.id,
    aircraftId: updated.aircraft_id,
    metadata: {
      route_type: routeType,
      target_record_type: targetRecordType,
      target_record_id: targetRecordId,
      before_status: squawk.status,
      after_status: nextStatus,
      reason,
    },
  })

  await writeSquawkTimeline(supabase, {
    organizationId: ctx.organizationId,
    aircraftId: updated.aircraft_id,
    actorId: ctx.user.id,
    action: 'squawk.routed',
    squawkId: params.id,
    title: `Squawk routed: ${updated.title}`,
    summary: routeType.replace(/_/g, ' '),
    ownerVisible: Boolean(updated.owner_visible),
    metadata: {
      route_type: routeType,
      target_record_type: targetRecordType,
      target_record_id: targetRecordId,
      after_status: nextStatus,
    },
  })

  return NextResponse.json({ squawk: updated, route }, { status: 201 })
}
