/**
 * POST /api/clock-events/[id]/break    Body: { reason?: string }   → start break
 * DELETE /api/clock-events/[id]/break                                 → end break
 *
 * Owner of the clock-event (or admin) only. Status guard runs at SQL
 * level via `eq('status', ...)` on the UPDATE so concurrent flips fail
 * cleanly.
 *
 * Spec 2.5.3.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { startBreak, endBreak } from '@/lib/clock/queries'
import type { ClockEvent } from '@/types'

async function authorize(
  req: NextRequest,
  id: string,
): Promise<
  | { ok: true; ctx: NonNullable<Awaited<ReturnType<typeof resolveRequestOrgContext>>>; event: ClockEvent }
  | { ok: false; status: number; error: string }
> {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return { ok: false, status: 401, error: 'Unauthorized' }

  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!data) return { ok: false, status: 404, error: 'Not found' }

  const event = data as ClockEvent
  const isOwner = event.employee_id === ctx.user.id
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  if (!isOwner && !isAdmin) return { ok: false, status: 403, error: 'Not your clock event' }

  return { ok: true, ctx, event }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : null

  const result = await startBreak(createServerSupabase(), params.id, reason)
  if (!result.ok) return NextResponse.json({ error: result.error, event: result.event }, { status: 409 })
  return NextResponse.json({ event: result.event })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize(req, params.id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const result = await endBreak(createServerSupabase(), params.id)
  if (!result.ok) return NextResponse.json({ error: result.error, event: result.event }, { status: 409 })
  return NextResponse.json({ event: result.event })
}
