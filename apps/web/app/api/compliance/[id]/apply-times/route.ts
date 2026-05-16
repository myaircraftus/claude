/**
 * POST /api/compliance/[id]/apply-times
 *
 * Returns the aircraft's current times for the Due List side panel's
 * "Apply Times" button — so the operator can stamp a compliance record
 * with the current airframe hours/date in one click.
 *
 * Response: { hours, landings, date }
 *
 * NOTE: `hours` is the aircraft's airframe total time (aircraft.total_time_hours).
 * `landings` is returned as 0 — the aircraft table has no landings/cycles
 * counter yet; the operator fills it in manually.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: item } = await supabase
    .from('compliance_items')
    .select('id, aircraft_id')
    .eq('organization_id', orgId)
    .eq('id', params.id)
    .maybeSingle()

  if (!item) {
    return NextResponse.json({ error: 'Compliance item not found' }, { status: 404 })
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('total_time_hours')
    .eq('organization_id', orgId)
    .eq('id', (item as { aircraft_id: string }).aircraft_id)
    .maybeSingle()

  return NextResponse.json({
    hours: (aircraft as { total_time_hours?: number } | null)?.total_time_hours ?? 0,
    landings: 0,
    date: new Date().toISOString().slice(0, 10),
  })
}
