/**
 * POST /api/clock-events/[id]/clock-out
 *
 * Closes any open break, sets clock_out_at + total_hours, AND auto-closes
 * any running per-WO TimeEntry (sprint 2.3) for this employee. Spec
 * 2.5.3: "Clocking out auto-closes any running per-WO timer."
 *
 * Returns: { event, closed_time_entries: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clockOutEmployee } from '@/lib/clock/queries'
import type { ClockEvent } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: event } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = (event as ClockEvent).employee_id === ctx.user.id
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Not your clock event' }, { status: 403 })
  }

  const result = await clockOutEmployee(supabase, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, event: result.event }, { status: 409 })
  }
  return NextResponse.json({ event: result.event, closed_time_entries: result.closedTimeEntries })
}
