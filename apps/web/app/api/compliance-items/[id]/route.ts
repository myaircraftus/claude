/**
 * /api/compliance-items/[id] (Spec 1.2)
 *
 * GET    → single item.
 * PATCH  → edit fields. Recomputes after the patch lands.
 *          Body: any subset of title / source / source_reference /
 *          interval_* / tolerance_* / last_completed_* / requires_rii / notes /
 *          status (only 'deferred' or 'current' allowed via PATCH; the
 *          recompute owns 'due-soon' / 'overdue').
 * DELETE → remove (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { recomputeCompliance } from '@/lib/compliance/recompute'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { buildClassificationPatch } from '@/lib/taxonomy/format'
import type { OrgRole } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.title === 'string')             updates.title = body.title.trim()
  if (typeof body.source_reference === 'string' || body.source_reference === null) {
    updates.source_reference = body.source_reference
  }
  if (typeof body.notes === 'string' || body.notes === null) updates.notes = body.notes
  if (typeof body.requires_rii === 'boolean')     updates.requires_rii = body.requires_rii

  // Status: only 'deferred' or 'current' allowed via PATCH. The recompute
  // owns 'due-soon' / 'overdue'. Setting 'current' is the way to undo
  // 'deferred' — the next recompute may flip it back to due/overdue.
  if (body.status === 'deferred' || body.status === 'current') {
    updates.status = body.status
  } else if (body.status !== undefined) {
    return NextResponse.json(
      { error: "status PATCH only accepts 'deferred' or 'current'" },
      { status: 400 },
    )
  }

  // Numeric fields. NULL is allowed to clear a value.
  for (const k of [
    'interval_calendar_months',
    'interval_hours',
    'interval_cycles',
    'tolerance_calendar_days',
    'tolerance_hours',
    'last_completed_hours',
    'last_completed_cycles',
  ] as const) {
    if (k in body) updates[k] = body[k] === null || body[k] === '' ? null : Number(body[k])
  }
  if ('last_completed_date' in body) {
    updates.last_completed_date = body.last_completed_date || null
  }
  Object.assign(updates, buildClassificationPatch(body))

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('compliance_items')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Recompute that aircraft's items so this change reflects in the list.
  const aircraftId = (data as { aircraft_id: string }).aircraft_id
  await recomputeCompliance(supabase, aircraftId, { userId: ctx.user.id }).catch(() => null)

  // Re-read to capture the recomputed status / next_due_* on this item.
  const { data: refreshed } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({ item: refreshed ?? data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Spec polish.cross-rollout — soft-delete via deleted_at; trash + 30d purge.
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('compliance_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
