// POST /api/parts/search
// Runs AI part resolution + SerpAPI + eBay providers, normalizes, ranks, persists.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { searchParts } from '@/lib/parts/search'
import type { AircraftContext } from '@/lib/parts/ai-resolve'

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

  // Fetch full aircraft context for AI resolution (not just make/model)
  let aircraftMakeModel: string | null = null
  let aircraftYear: number | null = null
  let engineModel: string | null = null
  let aircraftContext: AircraftContext | null = null

  if (body.aircraft_id) {
    const { data: ac } = await supabase
      .from('aircraft')
      .select('tail_number, make, model, year, serial_number, engine_make, engine_model, engine_serial, prop_make, prop_model')
      .eq('id', body.aircraft_id)
      .single()

    if (ac) {
      aircraftMakeModel = [ac.make, ac.model].filter(Boolean).join(' ') || null
      aircraftYear = ac.year ?? null
      engineModel = [ac.engine_make, ac.engine_model].filter(Boolean).join(' ') || null

      // Build full context for AI resolution
      aircraftContext = {
        tailNumber: ac.tail_number,
        make: ac.make ?? 'Unknown',
        model: ac.model ?? 'Unknown',
        year: ac.year,
        serialNumber: ac.serial_number,
        engineMake: ac.engine_make,
        engineModel: ac.engine_model,
        engineSerial: ac.engine_serial,
        propMake: ac.prop_make,
        propModel: ac.prop_model,
      }
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
      engineModel,
      aircraftContext,
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
