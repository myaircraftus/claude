/**
 * /api/meter-readings/[id] (Spec 1.1)
 *
 * PATCH  → edit a historical reading. Spec acceptance: "edit historical
 *          readings". Body: { value?, reading_date?, notes? }.
 * DELETE → remove (mechanic+ only — pilots can log but not delete).
 *
 * We do NOT re-emit a signal on edit. The orchestrator state already
 * reflects the original signal; editing is a correction, not a new event.
 * If a UI later wants "edit fires recompute", it can post to
 * /api/ai/orchestrator/tick.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

const READING_EDIT_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic', 'pilot'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!READING_EDIT_ROLES.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: { value?: number; reading_date?: string; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if ('value' in body) {
    if (!Number.isFinite(body.value) || (body.value as number) < 0) {
      return NextResponse.json({ error: 'value must be a non-negative number' }, { status: 400 })
    }
    updates.value = body.value
  }
  if ('reading_date' in body) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.reading_date))) {
      return NextResponse.json({ error: 'reading_date must be ISO date (YYYY-MM-DD)' }, { status: 400 })
    }
    updates.reading_date = body.reading_date
  }
  if ('notes' in body) updates.notes = body.notes ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('meter_readings')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ reading: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Only mechanic+ can delete readings' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('meter_readings')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
