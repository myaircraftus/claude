// POST /api/parts/search
// Runs AI part resolution + SerpAPI + eBay providers, normalizes, ranks, persists.

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { searchParts } from '@/lib/parts/search'
import type { AircraftContext } from '@/lib/parts/ai-resolve'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId

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

  if (!aircraftContext && body.aircraft_context && typeof body.aircraft_context === 'object') {
    const context = body.aircraft_context as Partial<AircraftContext>
    const make = typeof context.make === 'string' ? context.make.trim() : ''
    const model = typeof context.model === 'string' ? context.model.trim() : ''

    aircraftMakeModel = [make, model].filter(Boolean).join(' ') || null
    aircraftYear = typeof context.year === 'number' ? context.year : null
    engineModel = [context.engineMake, context.engineModel]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ') || null

    if (typeof context.tailNumber === 'string' && context.tailNumber.trim()) {
      aircraftContext = {
        tailNumber: context.tailNumber.trim(),
        make: make || 'Unknown',
        model: model || 'Unknown',
        year: typeof context.year === 'number' ? context.year : null,
        serialNumber: typeof context.serialNumber === 'string' ? context.serialNumber : null,
        engineMake: typeof context.engineMake === 'string' ? context.engineMake : null,
        engineModel: typeof context.engineModel === 'string' ? context.engineModel : null,
        engineSerial: typeof context.engineSerial === 'string' ? context.engineSerial : null,
        propMake: typeof context.propMake === 'string' ? context.propMake : null,
        propModel: typeof context.propModel === 'string' ? context.propModel : null,
      }
    }
  }

  try {
    const result = await searchParts(supabase, {
      query,
      organizationId: orgId,
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
