/**
 * GET /api/aircraft/[id]/predictions  (Spec 5.3)
 *
 * Returns the latest predictor outputs for an aircraft. Read-only — does
 * NOT write ai_action_cards. The cron route does the card writes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { runAircraftPredictors } from '@/lib/ai/predictors/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', membership.organization_id)
    .eq('id', params.id)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const predictions = await runAircraftPredictors(supabase, {
    organization_id: membership.organization_id,
    aircraft_id: params.id,
    narrate: false,
  })
  return NextResponse.json({
    aircraft_id: params.id,
    tail_number: (aircraft as { tail_number: string }).tail_number,
    predictions,
  })
}
