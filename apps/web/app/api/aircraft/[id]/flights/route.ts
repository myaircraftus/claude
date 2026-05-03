/**
 * GET /api/aircraft/[id]/flights  (Spec 4.3)
 *
 * Returns recent flight_events for one aircraft, newest first. Drives the
 * aircraft Sync tab UI.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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

  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)))
  const includeConfirmed = searchParams.get('include_confirmed') === '1'

  let q = supabase
    .from('flight_events')
    .select('*')
    .eq('aircraft_id', params.id)
    .eq('organization_id', membership.organization_id)
    .is('superseded_by', null)
    .order('start_time', { ascending: false })
    .limit(limit)

  if (!includeConfirmed) q = q.is('confirmed_at', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flights: data ?? [] })
}
