/**
 * GET /api/work-orders/[id]/labor (Spec 2.3)
 *
 * Returns the WO's aggregated labor breakdown:
 *   - closed time entries
 *   - currently-running open entries (hours + cost ticking)
 *   - manual work_order_lines.labor (legacy 016)
 *   - totals (hours + cost)
 *
 * Drives the TimeClockPanel header + the WO labor cost rollup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { aggregateWorkOrderHours } from '@/lib/timeclock/clock'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id, work_order_number')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const aggregate = await aggregateWorkOrderHours(supabase, ctx.organizationId, params.id)

  // Include the entry list for the panel (closed + open, newest first).
  const { data: entries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('work_order_id', params.id)
    .order('start_time', { ascending: false })

  return NextResponse.json({
    work_order: wo,
    aggregate,
    entries: entries ?? [],
  })
}
