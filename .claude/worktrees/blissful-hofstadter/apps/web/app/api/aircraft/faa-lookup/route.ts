import { NextRequest, NextResponse } from 'next/server'

// FAA Aircraft Registry lookup proxy
// Fetches aircraft data by N-number from FAA's public registry API

interface FAALookupResult {
  tail_number: string
  make: string
  model: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  aircraft_category?: string
  aircraft_type?: string
  registrant_name?: string
  base_airport?: string
}

// Map FAA engine type codes to readable names
const ENGINE_TYPE_MAP: Record<string, string> = {
  '1': 'Reciprocating',
  '2': 'Turbo-prop',
  '3': 'Turbo-shaft',
  '4': 'Turbo-jet',
  '5': 'Turbo-fan',
  '6': 'Ramjet',
  '7': '2 Cycle',
  '8': '4 Cycle',
  '9': 'Unknown',
  '10': 'Electric',
  '11': 'Rotary',
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tail = searchParams.get('tail')?.toUpperCase().replace(/^N/, '')

  if (!tail) {
    return NextResponse.json({ error: 'tail number required' }, { status: 400 })
  }

  // Full tail number with N prefix
  const nNumber = `N${tail}`

  try {
    // Try FAA Registry API v1 - the primary JSON endpoint
    const faaUrl = `https://registry.faa.gov/aircraftinquiry/api/NNumInquiry/${encodeURIComponent(nNumber)}`

    const resp = await fetch(faaUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MyAircraft/1.0 (aircraft management platform)',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (resp.ok) {
      const raw = await resp.json()
      const result = parseFAAResponse(nNumber, raw)
      if (result) {
        return NextResponse.json(result)
      }
    }

    // Fallback: try the av-info API
    const avInfoUrl = `https://av-info.faa.gov/api/Aircraft/AcftRef?NNum=${encodeURIComponent(nNumber)}`
    const avResp = await fetch(avInfoUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })

    if (avResp.ok) {
      const avRaw = await avResp.json()
      const result = parseAvInfoResponse(nNumber, avRaw)
      if (result) {
        return NextResponse.json(result)
      }
    }

    return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
  } catch (err: any) {
    // FAA API might be unreachable — return graceful error
    return NextResponse.json(
      { error: 'FAA Registry unreachable. Please enter details manually.' },
      { status: 503 }
    )
  }
}

function parseFAAResponse(nNumber: string, raw: any): FAALookupResult | null {
  // The FAA Registry JSON API response structure
  const ac = raw?.aircraftReference || raw?.aircraft || raw
  if (!ac) return null

  const desc = raw?.aircraftDescription || raw?.acftRef || ac
  const engine = raw?.engineReference || raw?.engRef || {}
  const registrant = raw?.registrantInformation || raw?.registrant || {}

  // Extract manufacturer/make
  const make = (
    desc?.manufacturer ||
    desc?.acftMfr ||
    ac?.mfr ||
    ac?.manufacturer ||
    ''
  ).trim()

  const model = (
    desc?.model ||
    desc?.acftModel ||
    ac?.model ||
    ''
  ).trim()

  if (!make && !model) return null

  // Year from manufacture date or year_mfr
  let year: number | undefined
  const yearRaw = desc?.yearMfr || desc?.year_mfr || ac?.yearMfr || ac?.year
  if (yearRaw) {
    const parsed = parseInt(String(yearRaw), 10)
    if (!isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
      year = parsed
    }
  }

  const serial = (desc?.serialNumber || desc?.serial || ac?.serialNumber || ac?.serial || '').trim()

  // Engine info
  const engineMfr = (
    engine?.manufacturer ||
    engine?.engMfr ||
    desc?.engMfr ||
    ac?.engineMfr ||
    ''
  ).trim()

  const engineModel = (
    engine?.model ||
    engine?.engModel ||
    desc?.engModel ||
    ac?.engineModel ||
    ''
  ).trim()

  const registrantName = (
    registrant?.name ||
    registrant?.registrantName ||
    raw?.registrantName ||
    ''
  ).trim()

  return {
    tail_number: nNumber,
    make,
    model,
    year,
    serial_number: serial || undefined,
    engine_make: engineMfr || undefined,
    engine_model: engineModel || undefined,
    registrant_name: registrantName || undefined,
  }
}

function parseAvInfoResponse(nNumber: string, raw: any): FAALookupResult | null {
  if (!raw || (!raw.make && !raw.mfr && !raw.manufacturer)) return null

  const make = (raw.make || raw.mfr || raw.manufacturer || '').trim()
  const model = (raw.model || raw.acftModel || '').trim()

  if (!make && !model) return null

  let year: number | undefined
  if (raw.year || raw.yearMfr) {
    const parsed = parseInt(String(raw.year || raw.yearMfr), 10)
    if (!isNaN(parsed) && parsed > 1900) year = parsed
  }

  return {
    tail_number: nNumber,
    make,
    model,
    year,
    serial_number: (raw.serialNumber || raw.serial || '').trim() || undefined,
    engine_make: (raw.engineMfr || raw.engMfr || '').trim() || undefined,
    engine_model: (raw.engineModel || raw.engModel || '').trim() || undefined,
  }
}
