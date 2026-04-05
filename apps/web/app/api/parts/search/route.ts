// POST /api/parts/search
// Runs SerpAPI + eBay providers, normalizes, ranks, persists search + offers.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { searchParts } from '@/lib/parts/search'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()
  const query = String(body.query ?? '').trim()
  if (!query) return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  if (query.length > 200) return NextResponse.json({ error: 'Query too long' }, { status: 400 })

  // Optional aircraft context: look up make/model/year for ranking + query-building
  let aircraftMakeModel: string | null = null
  let aircraftYear: number | null = null
  if (body.aircraft_id) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('make, model, year')
      .eq('id', body.aircraft_id)
      .single()
    if (ac) {
      aircraftMakeModel = [ac.make, ac.model].filter(Boolean).join(' ') || null
      aircraftYear = ac.year ?? null
    }
  }

  try {
    const result = await searchParts(supabase, {
      query,
      organizationId: membership.organization_id,
      aircraftId: body.aircraft_id ?? null,
      workOrderId: body.work_order_id ?? null,
      maintenanceDraftId: body.maintenance_draft_id ?? null,
      userId: user.id,
      aircraftMakeModel,
      aircraftYear,
      engineModel: body.engine_model ?? null,
      maxResults: typeof body.limit === 'number' ? Math.min(body.limit, 50) : 30,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Search failed' },
      { status: 500 }
    )
  }
}
