/**
 * /api/serial-components/[id]  (Spec 3.2)
 *
 *   GET    → single row
 *   PATCH  → partial update of safe fields (notes / hours / status)
 *   DELETE → hard delete (rare; usually status='scrapped' instead)
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeStrOptional } from '@/lib/validation/common'
import type { ComponentStatus, SerialComponent } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set<ComponentStatus>(['installed', 'in-stock', 'in-overhaul', 'scrapped'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])
const DELETE_ROLES = new Set(['owner', 'admin'])

// Spec 5.4 — runtime body validation. Hour fields are bounded to a
// realistic engine-life ceiling (50,000 hr; way above any TBO).
const PatchBody = z.object({
  description: safeStrOptional.nullable(),
  hours_since_overhaul: z.number().finite().min(0).max(50_000).optional(),
  hours_since_new: z.number().finite().min(0).max(50_000).optional(),
  status: z.enum(['installed', 'in-stock', 'in-overhaul', 'scrapped']).optional(),
  notes: safeStrOptional.nullable(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data } = await supabase
    .from('serial_components')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ component: data as SerialComponent })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const parsed = await parseJsonBody(req, PatchBody)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const patch: Record<string, unknown> = {}
  if (body.description !== undefined) patch.description = body.description
  if (typeof body.hours_since_overhaul === 'number') patch.hours_since_overhaul = body.hours_since_overhaul
  if (typeof body.hours_since_new === 'number') patch.hours_since_new = body.hours_since_new
  if (body.status && VALID_STATUS.has(body.status)) patch.status = body.status
  if (body.notes !== undefined) patch.notes = body.notes
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('serial_components')
    .update(patch)
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ component: data as SerialComponent })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!DELETE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  // Spec polish.cross-rollout — soft-delete via deleted_at; trash + 30d purge.
  // For SerialComponent the conventional path is status='scrapped'; this
  // soft-delete is for "I created this row by mistake" recoverability.
  const { error } = await supabase
    .from('serial_components')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
