/**
 * GET /api/me/time-clock (Spec 2.3)
 *
 * Returns the calling user's currently-open entry (if any) plus a small
 * "today" summary (total closed hours today). Drives the running-timer
 * chip on Topbar — it polls this endpoint every 30s.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOpenEntryForUser } from '@/lib/timeclock/clock'
import type { TimeEntry } from '@/types'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const open = await getOpenEntryForUser(supabase, ctx.organizationId, ctx.user.id)

  // Today summary: closed entries with start_time >= start of today (UTC).
  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)
  const { data: todayRows } = await supabase
    .from('time_entries')
    .select('start_time, end_time, hourly_rate')
    .eq('organization_id', ctx.organizationId)
    .eq('technician_id', ctx.user.id)
    .gte('start_time', startOfToday.toISOString())

  let todayClosedHours = 0
  let todayClosedCost = 0
  for (const r of (todayRows ?? []) as Array<{ start_time: string; end_time: string | null; hourly_rate: number }>) {
    if (!r.end_time) continue
    const a = new Date(r.start_time).getTime()
    const b = new Date(r.end_time).getTime()
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue
    const hrs = (b - a) / 3_600_000
    todayClosedHours += hrs
    todayClosedCost  += hrs * (Number(r.hourly_rate) || 0)
  }

  // For convenience, attach the WO tail-number if there's an open entry.
  let openWorkOrder: { id: string; work_order_number: string | null; aircraft_id: string | null; aircraft_tail: string | null } | null = null
  if (open) {
    const { data: wo } = await supabase
      .from('work_orders')
      .select('id, work_order_number, aircraft_id')
      .eq('id', (open as TimeEntry).work_order_id)
      .maybeSingle()
    let tail: string | null = null
    if (wo?.aircraft_id) {
      const { data: ac } = await supabase
        .from('aircraft')
        .select('tail_number')
        .eq('id', wo.aircraft_id)
        .maybeSingle()
      tail = ac?.tail_number ?? null
    }
    if (wo) {
      openWorkOrder = {
        id: (wo as { id: string }).id,
        work_order_number: (wo as { work_order_number: string | null }).work_order_number,
        aircraft_id: (wo as { aircraft_id: string | null }).aircraft_id,
        aircraft_tail: tail,
      }
    }
  }

  return NextResponse.json({
    open_entry: open,
    open_work_order: openWorkOrder,
    today: {
      closed_hours: todayClosedHours,
      closed_cost:  todayClosedCost,
    },
  })
}
