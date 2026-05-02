/**
 * GET  /api/shifts        — list shifts for the active org. Optional
 *                           query params:
 *                             ?from=ISO     — overlap window start
 *                             ?to=ISO       — overlap window end
 *                             ?technician_id=UUID
 *                             ?status=enum  — repeatable
 * POST /api/shifts        — create. Owner/admin only (mirrors RLS).
 *
 * Spec 2.5.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Shift, ShiftStatus } from '@/types'

const ALLOWED_STATUSES: ShiftStatus[] = [
  'scheduled', 'in-progress', 'completed', 'missed', 'swapped',
]

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)

  let query = supabase
    .from('shifts')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('start_time', { ascending: true })
    .limit(500)

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from) query = query.gt('end_time', from)
  if (to) query = query.lt('start_time', to)

  const technicianId = searchParams.get('technician_id')
  if (technicianId) query = query.eq('technician_id', technicianId)

  const statuses = searchParams.getAll('status').filter((s): s is ShiftStatus =>
    (ALLOWED_STATUSES as string[]).includes(s),
  )
  if (statuses.length > 0) query = query.in('status', statuses)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ shifts: (data ?? []) as Shift[] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json(
      { error: 'Only owner/admin can schedule shifts' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null) as Partial<Shift> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 120) {
    return NextResponse.json({ error: 'name required (1-120 chars)' }, { status: 400 })
  }

  const technicianId = typeof body.technician_id === 'string' ? body.technician_id : ''
  if (!technicianId) {
    return NextResponse.json({ error: 'technician_id required' }, { status: 400 })
  }

  const startTime = typeof body.start_time === 'string' ? body.start_time : ''
  const endTime = typeof body.end_time === 'string' ? body.end_time : ''
  if (!startTime || !endTime) {
    return NextResponse.json({ error: 'start_time + end_time required (ISO)' }, { status: 400 })
  }
  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 })
  }

  const status: ShiftStatus =
    typeof body.status === 'string' && (ALLOWED_STATUSES as string[]).includes(body.status)
      ? (body.status as ShiftStatus)
      : 'scheduled'

  const roles = Array.isArray(body.roles)
    ? body.roles.filter((r): r is string => typeof r === 'string').slice(0, 32)
    : []

  const reminders = Array.isArray(body.reminders) ? body.reminders : []
  const checklist = Array.isArray(body.checklist) ? body.checklist : []

  // Confirm the technician_id is a real org member — a 22P02 from a
  // bogus uuid would surface as a generic 500 otherwise.
  const { data: membership } = await supabase()
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', technicianId)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json(
      { error: 'technician_id is not an active member of this org' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase()
    .from('shifts')
    .insert({
      organization_id: ctx.organizationId,
      location_id: typeof body.location_id === 'string' ? body.location_id : null,
      name,
      technician_id: technicianId,
      roles,
      start_time: startTime,
      end_time: endTime,
      status,
      reminders,
      checklist,
      notes: typeof body.notes === 'string' ? body.notes : null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shift: data as Shift }, { status: 201 })
}

// Tiny helper to avoid re-creating the client twice in POST. Memoized
// per-request via the request-scoped resolveRequestOrgContext above.
function supabase() {
  return createServerSupabase()
}
