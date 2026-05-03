/**
 * GET /api/aircraft/[id]/operating-cost?period=30d|90d|365d  (Spec 7.4)
 *
 * Returns the per-hour cost breakdown — wet + dry, plus components and
 * confidence + notes. Pure read; no writes. Org-scoped via the standard
 * server-side Supabase client (RLS enforces aircraft + cost_entries +
 * flight_events visibility).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { computeTrueOperatingCost, type LookbackPeriod } from '@/lib/costs/calculator'

export const dynamic = 'force-dynamic'

const VALID_PERIODS = new Set<LookbackPeriod>(['30d', '90d', '365d'])

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const url = new URL(req.url)
  const periodRaw = (url.searchParams.get('period') ?? '90d') as LookbackPeriod
  const period = VALID_PERIODS.has(periodRaw) ? periodRaw : '90d'

  // Verify aircraft belongs to this org before crunching numbers.
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const breakdown = await computeTrueOperatingCost({
      supabase,
      organizationId: membership.organization_id,
      aircraftId: params.id,
      period,
    })
    return NextResponse.json({
      aircraft_id: params.id,
      tail_number: (aircraft as { tail_number: string }).tail_number,
      period,
      ...breakdown,
    })
  } catch (e) {
    console.error('[operating-cost] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Calculation failed' },
      { status: 500 },
    )
  }
}
