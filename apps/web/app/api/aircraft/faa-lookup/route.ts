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

// ─── Manufacturer inference from model ──────────────────────────────────────
// FAA sometimes returns make as empty/unknown. We can infer from model + serial.
const MODEL_TO_MAKE: Record<string, string> = {
  // Cessna single-engine
  '120': 'CESSNA', '140': 'CESSNA', '150': 'CESSNA', '152': 'CESSNA',
  '170': 'CESSNA', '172': 'CESSNA', '172H': 'CESSNA', '172K': 'CESSNA',
  '172M': 'CESSNA', '172N': 'CESSNA', '172P': 'CESSNA', '172R': 'CESSNA',
  '172S': 'CESSNA', '172SP': 'CESSNA',
  '175': 'CESSNA', '177': 'CESSNA', '177B': 'CESSNA', '177RG': 'CESSNA',
  '180': 'CESSNA', '182': 'CESSNA', '182A': 'CESSNA', '182P': 'CESSNA',
  '182Q': 'CESSNA', '182R': 'CESSNA', '182S': 'CESSNA', '182T': 'CESSNA',
  '185': 'CESSNA', '188': 'CESSNA',
  '190': 'CESSNA', '195': 'CESSNA',
  '205': 'CESSNA', '206': 'CESSNA', '206H': 'CESSNA', '207': 'CESSNA',
  '210': 'CESSNA', '210A': 'CESSNA',
  // Cessna twins
  '310': 'CESSNA', '320': 'CESSNA', '335': 'CESSNA', '336': 'CESSNA',
  '337': 'CESSNA', '340': 'CESSNA', '340A': 'CESSNA',
  '401': 'CESSNA', '402': 'CESSNA', '404': 'CESSNA', '414': 'CESSNA',
  '421': 'CESSNA', '425': 'CESSNA',
  // Cessna jets
  '500': 'CESSNA', '501': 'CESSNA', '510': 'CESSNA', '525': 'CESSNA',
  '550': 'CESSNA', '560': 'CESSNA', '680': 'CESSNA', '750': 'CESSNA',
  // Piper
  'PA-28-140': 'PIPER', 'PA-28-151': 'PIPER', 'PA-28-161': 'PIPER',
  'PA-28-180': 'PIPER', 'PA-28-181': 'PIPER', 'PA-28-235': 'PIPER',
  'PA-28-236': 'PIPER', 'PA-28R-200': 'PIPER', 'PA-28R-201': 'PIPER',
  'PA-28RT-201': 'PIPER', 'PA-32-260': 'PIPER', 'PA-32-300': 'PIPER',
  'PA-32R-301': 'PIPER', 'PA-32R-301T': 'PIPER',
  'PA-34-200T': 'PIPER', 'PA-44-180': 'PIPER', 'PA-46-310P': 'PIPER',
  'PA-46-350P': 'PIPER', 'PA-46R-350T': 'PIPER',
  'PA-18': 'PIPER', 'PA-22': 'PIPER', 'PA-23': 'PIPER', 'PA-24': 'PIPER',
  'PA-30': 'PIPER', 'PA-31': 'PIPER', 'PA-38': 'PIPER',
  'J3C-65': 'PIPER', 'J-3': 'PIPER',
  // Beechcraft
  '33': 'BEECHCRAFT', '35': 'BEECHCRAFT', '35-33': 'BEECHCRAFT',
  '36': 'BEECHCRAFT', 'A36': 'BEECHCRAFT', 'V35B': 'BEECHCRAFT',
  '55': 'BEECHCRAFT', '58': 'BEECHCRAFT', '58P': 'BEECHCRAFT',
  '76': 'BEECHCRAFT', '77': 'BEECHCRAFT', '95-B55': 'BEECHCRAFT',
  'B36TC': 'BEECHCRAFT', 'G36': 'BEECHCRAFT',
  '19A': 'BEECHCRAFT', '23': 'BEECHCRAFT', '24R': 'BEECHCRAFT',
  // Mooney
  'M20': 'MOONEY', 'M20B': 'MOONEY', 'M20C': 'MOONEY', 'M20E': 'MOONEY',
  'M20F': 'MOONEY', 'M20J': 'MOONEY', 'M20K': 'MOONEY', 'M20R': 'MOONEY',
  'M20S': 'MOONEY', 'M20TN': 'MOONEY', 'M20U': 'MOONEY',
  // Cirrus
  'SR20': 'CIRRUS', 'SR22': 'CIRRUS', 'SR22T': 'CIRRUS',
  'SF50': 'CIRRUS',
  // Diamond
  'DA20': 'DIAMOND', 'DA40': 'DIAMOND', 'DA42': 'DIAMOND', 'DA62': 'DIAMOND',
  // Grumman / American General
  'AA-1': 'GRUMMAN', 'AA-5': 'GRUMMAN', 'AA-5A': 'GRUMMAN', 'AA-5B': 'GRUMMAN',
  'AG-5B': 'GRUMMAN',
}

function inferMakeFromModel(model: string): string | null {
  if (!model) return null
  const m = model.trim().toUpperCase()
  // Direct match
  if (MODEL_TO_MAKE[m]) return MODEL_TO_MAKE[m]
  // Try without trailing letter suffix (e.g. 172N → 172)
  const numOnly = m.replace(/[A-Z]+$/, '')
  if (numOnly && MODEL_TO_MAKE[numOnly]) return MODEL_TO_MAKE[numOnly]
  // Try prefix match for PA- models
  if (m.startsWith('PA-')) return 'PIPER'
  if (m.startsWith('M20')) return 'MOONEY'
  if (m.startsWith('SR2') || m.startsWith('SF5')) return 'CIRRUS'
  if (m.startsWith('DA') || m.startsWith('DA')) return 'DIAMOND'
  return null
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
      console.log(`[faa-lookup] ${nNumber} primary API response keys:`, JSON.stringify(Object.keys(raw ?? {})))
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
      console.log(`[faa-lookup] ${nNumber} fallback API response keys:`, JSON.stringify(Object.keys(avRaw ?? {})))
      const result = parseAvInfoResponse(nNumber, avRaw)
      if (result) {
        return NextResponse.json(result)
      }
    }

    return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
  } catch (err: any) {
    console.error(`[faa-lookup] ${nNumber} error:`, err?.message)
    // FAA API might be unreachable — return graceful error
    return NextResponse.json(
      { error: 'FAA Registry unreachable. Please enter details manually.' },
      { status: 503 }
    )
  }
}

/** Deep-search a value from nested object, trying multiple keys at each level */
function deepGet(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    // Try dotted path like "aircraftReference.manufacturer"
    const parts = path.split('.')
    let cur = obj
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') { cur = undefined; break }
      cur = cur[p]
    }
    if (cur != null && typeof cur === 'string' && cur.trim()) return cur.trim()
    if (cur != null && typeof cur === 'number') return String(cur)
  }
  return ''
}

function parseFAAResponse(nNumber: string, raw: any): FAALookupResult | null {
  // The FAA Registry JSON API has an inconsistent structure — log it for debugging
  // and try every known field path

  if (!raw || typeof raw !== 'object') return null

  // Sometimes the API wraps data in an array
  const data = Array.isArray(raw) ? raw[0] : raw

  // Try all known top-level wrappers
  const ac = data?.aircraftReference || data?.aircraft || data
  const desc = data?.aircraftDescription || data?.acftRef || data?.aircraftReference || ac
  const engine = data?.engineReference || data?.engRef || data?.engine || {}
  const registrant = data?.registrantInformation || data?.registrant || {}

  // Extract manufacturer/make — try EVERY known path
  let make = deepGet(data,
    'manufacturer', 'mfrName', 'mfr',
    'aircraftReference.manufacturer', 'aircraftReference.mfr',
    'aircraftDescription.manufacturer', 'aircraftDescription.mfr',
    'acftMfr',
  )
  if (!make) make = deepGet(desc, 'manufacturer', 'acftMfr', 'mfr', 'mfrName')
  if (!make) make = deepGet(ac, 'manufacturer', 'mfr', 'mfrName', 'acftMfr')

  const model = deepGet(data,
    'model', 'acftModel',
    'aircraftReference.model', 'aircraftDescription.model',
  ) || deepGet(desc, 'model', 'acftModel') || deepGet(ac, 'model', 'acftModel')

  if (!make && !model) return null

  // If make is empty/unknown, try to infer from model number
  if (!make || make.toLowerCase() === 'unknown') {
    const inferred = inferMakeFromModel(model)
    if (inferred) {
      console.log(`[faa-lookup] ${nNumber}: Inferred make "${inferred}" from model "${model}"`)
      make = inferred
    }
  }

  // Year from manufacture date or year_mfr
  let year: number | undefined
  const yearStr = deepGet(data, 'yearMfr', 'year_mfr', 'year',
    'aircraftReference.yearMfr', 'aircraftDescription.yearMfr')
    || deepGet(desc, 'yearMfr', 'year_mfr', 'year')
    || deepGet(ac, 'yearMfr', 'year')
  if (yearStr) {
    const parsed = parseInt(yearStr, 10)
    if (!isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
      year = parsed
    }
  }

  const serial = deepGet(data, 'serialNumber', 'serial',
    'aircraftReference.serialNumber', 'aircraftDescription.serialNumber')
    || deepGet(desc, 'serialNumber', 'serial')
    || deepGet(ac, 'serialNumber', 'serial')

  // Engine info — search deeply
  let engineMfr = deepGet(engine, 'manufacturer', 'engMfr', 'mfr', 'mfrName')
  if (!engineMfr) engineMfr = deepGet(data, 'engMfr', 'engineMfr', 'engineReference.manufacturer', 'engineReference.engMfr')
  if (!engineMfr) engineMfr = deepGet(desc, 'engMfr', 'engineMfr')

  let engineModel = deepGet(engine, 'model', 'engModel')
  if (!engineModel) engineModel = deepGet(data, 'engModel', 'engineModel', 'engineReference.model', 'engineReference.engModel')
  if (!engineModel) engineModel = deepGet(desc, 'engModel', 'engineModel')

  const registrantName = deepGet(registrant, 'name', 'registrantName')
    || deepGet(data, 'registrantName')

  console.log(`[faa-lookup] ${nNumber}: make="${make}" model="${model}" year=${year ?? 'n/a'} engine="${engineMfr} ${engineModel}"`)

  return {
    tail_number: nNumber,
    make: make || 'Unknown',
    model,
    year,
    serial_number: serial || undefined,
    engine_make: engineMfr || undefined,
    engine_model: engineModel || undefined,
    registrant_name: registrantName || undefined,
  }
}

function parseAvInfoResponse(nNumber: string, raw: any): FAALookupResult | null {
  if (!raw) return null
  const data = Array.isArray(raw) ? raw[0] : raw
  if (!data) return null

  let make = (data.make || data.mfr || data.manufacturer || data.mfrName || '').trim()
  const model = (data.model || data.acftModel || '').trim()

  if (!make && !model) return null

  // Infer make from model if missing
  if (!make || make.toLowerCase() === 'unknown') {
    const inferred = inferMakeFromModel(model)
    if (inferred) {
      console.log(`[faa-lookup] ${nNumber} (fallback): Inferred make "${inferred}" from model "${model}"`)
      make = inferred
    }
  }

  let year: number | undefined
  if (data.year || data.yearMfr) {
    const parsed = parseInt(String(data.year || data.yearMfr), 10)
    if (!isNaN(parsed) && parsed > 1900) year = parsed
  }

  console.log(`[faa-lookup] ${nNumber} (fallback): make="${make}" model="${model}" year=${year ?? 'n/a'}`)

  return {
    tail_number: nNumber,
    make: make || 'Unknown',
    model,
    year,
    serial_number: (data.serialNumber || data.serial || '').trim() || undefined,
    engine_make: (data.engineMfr || data.engMfr || '').trim() || undefined,
    engine_model: (data.engineModel || data.engModel || '').trim() || undefined,
  }
}
