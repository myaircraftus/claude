/**
 * GET /api/aircraft/[id]/compliance (Spec 1.2)
 *
 * Returns every compliance_items row for the aircraft + a pre-sorted
 * "due list" (overdue + due-soon, closest first). Drives the per-aircraft
 * compliance panel in one round-trip.
 *
 * The whole-org compliance page (`/compliance`) uses the bare /api/
 * compliance-items endpoint instead — this route is intentionally
 * aircraft-scoped.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDueList } from '@/lib/compliance/compute'
import type { ComplianceItem } from '@/types'

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

  const { data: items, error } = await supabase
    .from('compliance_items')
    .select('*')
    .eq('aircraft_id', params.id)
    .eq('organization_id', ctx.organizationId)
    .order('next_due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allItems = (items ?? []) as ComplianceItem[]
  const dueList = getDueList(allItems)

  return NextResponse.json({
    aircraft,
    items: allItems,
    due_list: dueList,
  })
}
