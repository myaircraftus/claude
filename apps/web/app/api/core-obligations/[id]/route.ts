/**
 * /api/core-obligations/[id]  (Spec 3.2)
 *
 *   PATCH → update status / received_date / notes / due_date / core_charge
 *           Setting status='received' auto-stamps received_date if missing.
 *   DELETE → owner/admin only
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { CoreObligation, CoreObligationStatus } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set<CoreObligationStatus>(['pending', 'received', 'overdue', 'waived'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])
const DELETE_ROLES = new Set(['owner', 'admin'])

interface PatchBody {
  status?: CoreObligationStatus
  received_date?: string | null
  due_date?: string | null
  core_charge?: number
  notes?: string | null
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

  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (body.status && VALID_STATUS.has(body.status)) {
    patch.status = body.status
    if (body.status === 'received' && !body.received_date) {
      patch.received_date = new Date().toISOString().slice(0, 10)
    }
  }
  if (body.received_date !== undefined) patch.received_date = body.received_date
  if (body.due_date !== undefined) patch.due_date = body.due_date
  if (typeof body.core_charge === 'number') patch.core_charge = body.core_charge
  if (body.notes !== undefined) patch.notes = body.notes
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('core_obligations')
    .update(patch)
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ obligation: data as CoreObligation })
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
  const { error } = await supabase
    .from('core_obligations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, soft: true })
}
