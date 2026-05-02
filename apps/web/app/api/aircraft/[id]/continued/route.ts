/**
 * GET /api/aircraft/[id]/continued (Spec 1.4)
 *
 * Returns every continued item for the aircraft in one round-trip:
 *   - active: open + in-progress (the spec's "open continued" list)
 *   - resolved: completed + wont-fix
 *   - all: combined, useful for history
 *
 * Drives AircraftContinuedItemsPanel + the WO-creation pull-in checklist
 * (logged follow-up).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ContinuedItem } from '@/types'

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0, high: 1, medium: 2, low: 3,
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('continued_items')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', params.id)
    .order('discovered_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = (data ?? []) as ContinuedItem[]

  // Sort active by priority desc, then by discovered_date desc.
  const active = all
    .filter((i) => i.status === 'open' || i.status === 'in-progress')
    .sort((a, b) => {
      const r = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
      if (r !== 0) return r
      return new Date(b.discovered_date).getTime() - new Date(a.discovered_date).getTime()
    })

  // Resolved: most-recently-resolved first.
  const resolved = all
    .filter((i) => i.status === 'completed' || i.status === 'wont-fix')
    .sort((a, b) => {
      const at = a.resolved_at ? new Date(a.resolved_at).getTime() : 0
      const bt = b.resolved_at ? new Date(b.resolved_at).getTime() : 0
      return bt - at
    })

  return NextResponse.json({
    aircraft,
    active,
    resolved,
    all,
  })
}
