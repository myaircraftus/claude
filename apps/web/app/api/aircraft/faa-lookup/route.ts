import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { normalizeTailNumber } from '@/lib/faa/registry'
import { lookupTailNumber, type FAALookupResult } from '@/lib/faa/service'

async function lookupInternalAircraftProfile(
  service: ReturnType<typeof createServiceSupabase>,
  normalizedTail: string
): Promise<FAALookupResult | null> {
  const { data: aircraft, error } = await service
    .from('aircraft')
    .select('tail_number, make, model, year, serial_number, engine_make, engine_model, owner_customer_id')
    .ilike('tail_number', normalizedTail)
    .limit(1)
    .maybeSingle()

  if (error || !aircraft) {
    return null
  }

  let registrantName: string | undefined
  if (aircraft.owner_customer_id) {
    const { data: customer } = await service
      .from('customers')
      .select('name')
      .eq('id', aircraft.owner_customer_id)
      .maybeSingle()

    registrantName = customer?.name ?? undefined
  }

  return {
    tail_number: aircraft.tail_number || normalizedTail,
    make: aircraft.make || 'Unknown',
    model: aircraft.model || '',
    year: aircraft.year ?? undefined,
    serial_number: aircraft.serial_number ?? undefined,
    engine_make: aircraft.engine_make ?? undefined,
    engine_model: aircraft.engine_model ?? undefined,
    registrant_name: registrantName,
  }
}

export async function GET(request: NextRequest) {
  const tail = request.nextUrl.searchParams.get('tail')?.trim() ?? ''
  const normalized = normalizeTailNumber(tail)

  if (!tail) {
    return NextResponse.json({ error: 'tail number required' }, { status: 400 })
  }

  if (!normalized) {
    return NextResponse.json(
      { error: 'Invalid FAA tail number format. Please enter a valid N-number.' },
      { status: 400 }
    )
  }

  try {
    const service = createServiceSupabase()
    const outcome = await lookupTailNumber(service, normalized.normalized)

    if (!outcome) {
      const internalProfile = await lookupInternalAircraftProfile(service, normalized.normalized)
      if (internalProfile) {
        return NextResponse.json({
          ...internalProfile,
          cache_status: 'internal_profile',
          source: 'internal_aircraft_profile',
        })
      }

      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    return NextResponse.json({
      ...outcome.result,
      cache_status: outcome.cacheStatus,
      source: outcome.source,
    })
  } catch (error) {
    console.error(`[faa-lookup] ${normalized.normalized} error:`, error)
    return NextResponse.json(
      { error: 'FAA Registry unreachable. Please enter details manually.' },
      { status: 503 }
    )
  }
}
