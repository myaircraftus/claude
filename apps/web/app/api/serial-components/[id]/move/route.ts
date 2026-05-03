/**
 * POST /api/serial-components/[id]/move  (Spec 3.2)
 *
 * Body:
 *   { to_aircraft_id?: string|null, to_status: ComponentStatus,
 *     work_order_id?: string|null, notes?: string,
 *     installed_hours?: number, hours_since_overhaul?: number, hours_since_new?: number }
 *
 * Atomically:
 *   1. Append a ComponentMove row to removal_history (preserving prior history).
 *   2. Update installed_on_aircraft / status / installed_date / installed_hours.
 *   3. Optionally update hours_since_overhaul / hours_since_new (e.g. after
 *      an overhaul resets HSO to 0).
 *
 * Mechanic+ only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ComponentMove, ComponentStatus, SerialComponent } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set<ComponentStatus>(['installed', 'in-stock', 'in-overhaul', 'scrapped'])
const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface MoveBody {
  to_aircraft_id?: string | null
  to_status: ComponentStatus
  work_order_id?: string | null
  notes?: string | null
  installed_hours?: number | null
  hours_since_overhaul?: number
  hours_since_new?: number
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  let body: MoveBody
  try { body = (await req.json()) as MoveBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!VALID_STATUS.has(body.to_status)) {
    return NextResponse.json({ error: 'invalid to_status' }, { status: 400 })
  }

  // Load current row to compute the move row + preserve history.
  const { data: existing } = await supabase
    .from('serial_components')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cur = existing as SerialComponent

  const now = new Date().toISOString().slice(0, 10)
  const newMove: ComponentMove = {
    date: now,
    from_aircraft_id: cur.installed_on_aircraft ?? null,
    to_aircraft_id: body.to_aircraft_id ?? null,
    from_status: cur.status,
    to_status: body.to_status,
    work_order_id: body.work_order_id ?? null,
    notes: body.notes ?? null,
  }

  // Build patch.
  const patch: Record<string, unknown> = {
    installed_on_aircraft: body.to_status === 'installed' ? (body.to_aircraft_id ?? null) : null,
    status: body.to_status,
    removal_history: [...(cur.removal_history ?? []), newMove],
  }
  if (body.to_status === 'installed') {
    patch.installed_date = now
    if (typeof body.installed_hours === 'number') patch.installed_hours = body.installed_hours
  }
  if (typeof body.hours_since_overhaul === 'number') patch.hours_since_overhaul = body.hours_since_overhaul
  if (typeof body.hours_since_new === 'number') patch.hours_since_new = body.hours_since_new

  const { data, error } = await supabase
    .from('serial_components')
    .update(patch)
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ component: data as SerialComponent, move: newMove })
}
