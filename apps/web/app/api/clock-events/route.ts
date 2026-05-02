/**
 * GET  /api/clock-events
 *      ?employee_id=UUID  (admin only when not self)
 *      ?status=clocked-in|on-break|clocked-out  (repeatable)
 *      ?from=YYYY-MM-DD  ?to=YYYY-MM-DD  (overlap on clock_in_at)
 *      ?scope=mine
 *
 * POST /api/clock-events
 *      Body: { shift_id?, notes?, image_url? }
 *      Self only (admins use ?employee_id= to clock someone in).
 *
 * Spec 2.5.3.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clockInEmployee } from '@/lib/clock/queries'
import type { ClockEvent, ClockEventStatus } from '@/types'

const ALLOWED_STATUSES: ClockEventStatus[] = ['clocked-in', 'on-break', 'clocked-out']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)
  const isAdmin = ['owner', 'admin'].includes(ctx.role)

  let query = supabase
    .from('clock_events')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('clock_in_at', { ascending: false })
    .limit(300)

  if (searchParams.get('scope') === 'mine') {
    query = query.eq('employee_id', ctx.user.id)
  } else {
    const employeeId = searchParams.get('employee_id')
    if (employeeId) query = query.eq('employee_id', employeeId)
    else if (!isAdmin) {
      // Non-admin without explicit scope is forced to self — preserves
      // privacy (techs shouldn't see other techs' clock history by default).
      query = query.eq('employee_id', ctx.user.id)
    }
  }

  const statuses = searchParams.getAll('status').filter((s): s is ClockEventStatus =>
    (ALLOWED_STATUSES as string[]).includes(s),
  )
  if (statuses.length > 0) query = query.in('status', statuses)

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from) query = query.gte('clock_in_at', from)
  if (to) query = query.lte('clock_in_at', to + 'T23:59:59.999Z')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: (data ?? []) as ClockEvent[] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Partial<ClockEvent>
  const isAdmin = ['owner', 'admin'].includes(ctx.role)

  // Admin can clock another tech in via employee_id; otherwise self.
  const employeeId = (isAdmin && typeof body.employee_id === 'string' && body.employee_id)
    ? body.employee_id
    : ctx.user.id

  const supabase = createServerSupabase()
  const result = await clockInEmployee(supabase, {
    organizationId: ctx.organizationId,
    employeeId,
    shiftId: typeof body.shift_id === 'string' ? body.shift_id : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    imageUrl: typeof body.image_url === 'string' ? body.image_url : null,
  })

  if (!result.ok) {
    // 409 if already clocked in (returned with the existing event so the
    // client UI can show it without a second round-trip).
    return NextResponse.json(
      { error: result.error, event: result.event },
      { status: 409 },
    )
  }
  return NextResponse.json({ event: result.event }, { status: 201 })
}
