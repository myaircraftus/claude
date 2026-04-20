import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeTailNumber } from './registry'

export interface FAALookupResult {
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
  registrant_city?: string
  registrant_state?: string
  registrant_zip?: string
  registrant_type?: string
  registrant_country?: string
  base_airport?: string
}

type CacheStatus = 'hit_fresh' | 'hit_stale' | 'refreshed' | 'miss' | 'failed'
type SyncStatus = 'success' | 'cache_hit' | 'unmatched' | 'failed'

interface SnapshotRow {
  id: string
  tail_number: string
  normalized_tail: string
  fetched_at: string
  source: string
  raw_payload: Record<string, unknown>
  make: string | null
  model: string | null
  year: number | null
  serial_number: string | null
  engine_make: string | null
  engine_model: string | null
  registrant_name: string | null
  registrant_city: string | null
  registrant_state: string | null
  registrant_zip: string | null
  registrant_type: string | null
  registrant_country: string | null
}

interface LookupOutcome {
  result: FAALookupResult
  cacheStatus: CacheStatus
  source: string
}

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

const MODEL_TO_MAKE: Record<string, string> = {
  '120': 'CESSNA', '140': 'CESSNA', '150': 'CESSNA', '152': 'CESSNA',
  '170': 'CESSNA', '172': 'CESSNA', '172H': 'CESSNA', '172K': 'CESSNA',
  '172M': 'CESSNA', '172N': 'CESSNA', '172P': 'CESSNA', '172R': 'CESSNA',
  '172S': 'CESSNA', '172SP': 'CESSNA', '175': 'CESSNA', '177': 'CESSNA',
  '177B': 'CESSNA', '177RG': 'CESSNA', '180': 'CESSNA', '182': 'CESSNA',
  '182A': 'CESSNA', '182P': 'CESSNA', '182Q': 'CESSNA', '182R': 'CESSNA',
  '182S': 'CESSNA', '182T': 'CESSNA', '185': 'CESSNA', '188': 'CESSNA',
  '190': 'CESSNA', '195': 'CESSNA', '205': 'CESSNA', '206': 'CESSNA',
  '206H': 'CESSNA', '207': 'CESSNA', '210': 'CESSNA', '210A': 'CESSNA',
  '310': 'CESSNA', '320': 'CESSNA', '335': 'CESSNA', '336': 'CESSNA',
  '337': 'CESSNA', '340': 'CESSNA', '340A': 'CESSNA', '401': 'CESSNA',
  '402': 'CESSNA', '404': 'CESSNA', '414': 'CESSNA', '421': 'CESSNA',
  '425': 'CESSNA', '500': 'CESSNA', '501': 'CESSNA', '510': 'CESSNA',
  '525': 'CESSNA', '550': 'CESSNA', '560': 'CESSNA', '680': 'CESSNA',
  '750': 'CESSNA', 'PA-28-140': 'PIPER', 'PA-28-151': 'PIPER',
  'PA-28-161': 'PIPER', 'PA-28-180': 'PIPER', 'PA-28-181': 'PIPER',
  'PA-28-235': 'PIPER', 'PA-28-236': 'PIPER', 'PA-28R-200': 'PIPER',
  'PA-28R-201': 'PIPER', 'PA-28RT-201': 'PIPER', 'PA-32-260': 'PIPER',
  'PA-32-300': 'PIPER', 'PA-32R-301': 'PIPER', 'PA-32R-301T': 'PIPER',
  'PA-34-200T': 'PIPER', 'PA-44-180': 'PIPER', 'PA-46-310P': 'PIPER',
  'PA-46-350P': 'PIPER', 'PA-46R-350T': 'PIPER', 'PA-18': 'PIPER',
  'PA-22': 'PIPER', 'PA-23': 'PIPER', 'PA-24': 'PIPER', 'PA-30': 'PIPER',
  'PA-31': 'PIPER', 'PA-38': 'PIPER', 'J3C-65': 'PIPER', 'J-3': 'PIPER',
  '33': 'BEECHCRAFT', '35': 'BEECHCRAFT', '35-33': 'BEECHCRAFT',
  '36': 'BEECHCRAFT', 'A36': 'BEECHCRAFT', 'V35B': 'BEECHCRAFT',
  '55': 'BEECHCRAFT', '58': 'BEECHCRAFT', '58P': 'BEECHCRAFT',
  '76': 'BEECHCRAFT', '77': 'BEECHCRAFT', '95-B55': 'BEECHCRAFT',
  'B36TC': 'BEECHCRAFT', 'G36': 'BEECHCRAFT', '19A': 'BEECHCRAFT',
  '23': 'BEECHCRAFT', '24R': 'BEECHCRAFT', 'M20': 'MOONEY', 'M20B': 'MOONEY',
  'M20C': 'MOONEY', 'M20E': 'MOONEY', 'M20F': 'MOONEY', 'M20J': 'MOONEY',
  'M20K': 'MOONEY', 'M20R': 'MOONEY', 'M20S': 'MOONEY', 'M20TN': 'MOONEY',
  'M20U': 'MOONEY', 'SR20': 'CIRRUS', 'SR22': 'CIRRUS', 'SR22T': 'CIRRUS',
  'SF50': 'CIRRUS', 'DA20': 'DIAMOND', 'DA40': 'DIAMOND', 'DA42': 'DIAMOND',
  'DA62': 'DIAMOND', 'AA-1': 'GRUMMAN', 'AA-5': 'GRUMMAN', 'AA-5A': 'GRUMMAN',
  'AA-5B': 'GRUMMAN', 'AG-5B': 'GRUMMAN',
}

function getFreshnessHours(): number {
  const raw = Number(process.env.FAA_REGISTRY_FRESHNESS_HOURS ?? '72')
  return Number.isFinite(raw) && raw > 0 ? raw : 72
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String(error.code ?? '') : ''
  const message = 'message' in error ? String(error.message ?? '') : ''
  return code === '42P01' || /does not exist/i.test(message)
}

function deepGet(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        current = undefined
        break
      }
      current = current[part]
    }
    if (current != null && typeof current === 'string' && current.trim()) {
      return current.trim()
    }
    if (current != null && typeof current === 'number') {
      return String(current)
    }
  }
  return ''
}

function inferMakeFromModel(model: string): string | null {
  if (!model) return null
  const upper = model.trim().toUpperCase()
  if (MODEL_TO_MAKE[upper]) return MODEL_TO_MAKE[upper]
  const withoutSuffix = upper.replace(/[A-Z]+$/, '')
  if (withoutSuffix && MODEL_TO_MAKE[withoutSuffix]) return MODEL_TO_MAKE[withoutSuffix]
  if (upper.startsWith('PA-')) return 'PIPER'
  if (upper.startsWith('M20')) return 'MOONEY'
  if (upper.startsWith('SR2') || upper.startsWith('SF5')) return 'CIRRUS'
  if (upper.startsWith('DA')) return 'DIAMOND'
  return null
}

function normalizeMake(make: string, model: string): string {
  if (!make || make.toLowerCase() === 'unknown') {
    return inferMakeFromModel(model) ?? 'Unknown'
  }
  return make
}

function parseFAAResponse(nNumber: string, raw: any): FAALookupResult | null {
  if (!raw || typeof raw !== 'object') return null
  const data = Array.isArray(raw) ? raw[0] : raw
  const ac = data?.aircraftReference || data?.aircraft || data
  const desc = data?.aircraftDescription || data?.acftRef || data?.aircraftReference || ac
  const engine = data?.engineReference || data?.engRef || data?.engine || {}
  const registrant = data?.registrantInformation || data?.registrant || {}

  let make = deepGet(
    data,
    'manufacturer',
    'mfrName',
    'mfr',
    'aircraftReference.manufacturer',
    'aircraftReference.mfr',
    'aircraftDescription.manufacturer',
    'aircraftDescription.mfr',
    'acftMfr'
  )

  if (!make) make = deepGet(desc, 'manufacturer', 'acftMfr', 'mfr', 'mfrName')
  if (!make) make = deepGet(ac, 'manufacturer', 'mfr', 'mfrName', 'acftMfr')

  const model =
    deepGet(data, 'model', 'acftModel', 'aircraftReference.model', 'aircraftDescription.model') ||
    deepGet(desc, 'model', 'acftModel') ||
    deepGet(ac, 'model', 'acftModel')

  if (!make && !model) return null

  make = normalizeMake(make, model)

  let year: number | undefined
  const yearStr =
    deepGet(
      data,
      'yearMfr',
      'year_mfr',
      'year',
      'aircraftReference.yearMfr',
      'aircraftDescription.yearMfr'
    ) ||
    deepGet(desc, 'yearMfr', 'year_mfr', 'year') ||
    deepGet(ac, 'yearMfr', 'year')

  if (yearStr) {
    const parsed = parseInt(yearStr, 10)
    if (!Number.isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
      year = parsed
    }
  }

  const serial =
    deepGet(
      data,
      'serialNumber',
      'serial',
      'aircraftReference.serialNumber',
      'aircraftDescription.serialNumber'
    ) ||
    deepGet(desc, 'serialNumber', 'serial') ||
    deepGet(ac, 'serialNumber', 'serial')

  let engineMake = deepGet(engine, 'manufacturer', 'engMfr', 'mfr', 'mfrName')
  if (!engineMake) {
    engineMake = deepGet(
      data,
      'engMfr',
      'engineMfr',
      'engineReference.manufacturer',
      'engineReference.engMfr'
    )
  }
  if (!engineMake) engineMake = deepGet(desc, 'engMfr', 'engineMfr')

  let engineModel = deepGet(engine, 'model', 'engModel')
  if (!engineModel) {
    engineModel = deepGet(
      data,
      'engModel',
      'engineModel',
      'engineReference.model',
      'engineReference.engModel'
    )
  }
  if (!engineModel) engineModel = deepGet(desc, 'engModel', 'engineModel')

  const registrantName = deepGet(registrant, 'name', 'registrantName') || deepGet(data, 'registrantName')
  const registrantCity = deepGet(registrant, 'city', 'cityName') || deepGet(data, 'registrantCity')
  const registrantState = deepGet(registrant, 'state', 'stateCode', 'state') || deepGet(data, 'registrantState')
  const registrantZip = deepGet(registrant, 'zipCode', 'zip', 'postalCode') || deepGet(data, 'registrantZip')
  const registrantType = deepGet(registrant, 'type', 'registrationType', 'entityType') || deepGet(data, 'registrantType')
  const registrantCountry = deepGet(registrant, 'country', 'countryCode') || deepGet(data, 'registrantCountry')

  return {
    tail_number: nNumber,
    make,
    model,
    year,
    serial_number: serial || undefined,
    engine_make: engineMake || undefined,
    engine_model: engineModel || undefined,
    aircraft_type: ENGINE_TYPE_MAP[deepGet(data, 'engineType', 'engType')] || undefined,
    registrant_name: registrantName || undefined,
    registrant_city: registrantCity || undefined,
    registrant_state: registrantState || undefined,
    registrant_zip: registrantZip || undefined,
    registrant_type: registrantType || undefined,
    registrant_country: registrantCountry || undefined,
  }
}

function parseAvInfoResponse(nNumber: string, raw: any): FAALookupResult | null {
  if (!raw) return null
  const data = Array.isArray(raw) ? raw[0] : raw
  if (!data) return null

  const model = (data.model || data.acftModel || '').trim()
  const make = normalizeMake(
    (data.make || data.mfr || data.manufacturer || data.mfrName || '').trim(),
    model
  )

  if (!make && !model) return null

  let year: number | undefined
  const candidateYear = data.year || data.yearMfr
  if (candidateYear != null) {
    const parsed = parseInt(String(candidateYear), 10)
    if (!Number.isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
      year = parsed
    }
  }

  return {
    tail_number: nNumber,
    make,
    model,
    year,
    serial_number: (data.serialNumber || data.serial || '').trim() || undefined,
    engine_make: (data.engineMfr || data.engMfr || '').trim() || undefined,
    engine_model: (data.engineModel || data.engModel || '').trim() || undefined,
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, code) => {
      const parsed = Number.parseInt(code, 10)
      return Number.isFinite(parsed) ? String.fromCharCode(parsed) : ''
    })
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHtmlLabel(label: string): string {
  return stripHtml(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractHtmlTableByCaption(html: string, caption: string): string | null {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? []
  const desired = caption.toLowerCase()
  for (const table of tables) {
    const captions = [...table.matchAll(/<caption[^>]*>([\s\S]*?)<\/caption>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter(Boolean)
    if (captions.some((current) => current.toLowerCase() === desired)) {
      return table
    }
  }
  return null
}

function parseHtmlKeyValueTable(tableHtml: string): Record<string, string> {
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const parsed: Record<string, string> = {}

  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => stripHtml(match[1]))
      .filter(Boolean)

    for (let index = 0; index + 1 < cells.length; index += 2) {
      const key = normalizeHtmlLabel(cells[index])
      const value = cells[index + 1]?.trim()
      if (key && value) {
        parsed[key] = value
      }
    }
  }

  return parsed
}

function parseNumberField(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFaaHtmlResult(nNumber: string, html: string): FAALookupResult | null {
  const aircraftTable = extractHtmlTableByCaption(html, 'Aircraft Description')
  if (!aircraftTable) return null

  const aircraft = parseHtmlKeyValueTable(aircraftTable)
  const owner = parseHtmlKeyValueTable(extractHtmlTableByCaption(html, 'Registered Owner') ?? '')
  const airworthiness = parseHtmlKeyValueTable(extractHtmlTableByCaption(html, 'Airworthiness') ?? '')

  const model = aircraft['model'] ?? ''
  const make = normalizeMake(aircraft['manufacturer name'] ?? '', model)

  if (!make && !model) return null

  return {
    tail_number: nNumber,
    make,
    model,
    year: parseNumberField(aircraft['mfr year']),
    serial_number: aircraft['serial number'] || undefined,
    engine_make: airworthiness['engine manufacturer'] || undefined,
    engine_model: airworthiness['engine model'] || undefined,
    aircraft_category: airworthiness['category'] || undefined,
    aircraft_type: aircraft['type aircraft'] || undefined,
    registrant_name: owner['name'] || undefined,
    registrant_city: owner['city'] || undefined,
    registrant_state: owner['state'] || undefined,
    registrant_zip: owner['zip code'] || undefined,
    registrant_type: aircraft['type registration'] || undefined,
    registrant_country: owner['country'] || undefined,
  }
}

function snapshotToLookup(row: SnapshotRow): FAALookupResult {
  return {
    tail_number: row.tail_number,
    make: row.make || 'Unknown',
    model: row.model || '',
    year: row.year ?? undefined,
    serial_number: row.serial_number ?? undefined,
    engine_make: row.engine_make ?? undefined,
    engine_model: row.engine_model ?? undefined,
    registrant_name: row.registrant_name ?? undefined,
    registrant_city: row.registrant_city ?? undefined,
    registrant_state: row.registrant_state ?? undefined,
    registrant_zip: row.registrant_zip ?? undefined,
    registrant_type: row.registrant_type ?? undefined,
    registrant_country: row.registrant_country ?? undefined,
  }
}

async function readSnapshot(
  service: SupabaseClient,
  normalizedTail: string
): Promise<SnapshotRow | null> {
  const { data, error } = await service
    .from('aircraft_registry_snapshots')
    .select(
      'id, tail_number, normalized_tail, fetched_at, source, raw_payload, make, model, year, serial_number, engine_make, engine_model, registrant_name'
      + ', registrant_city, registrant_state, registrant_zip, registrant_type, registrant_country'
    )
    .eq('normalized_tail', normalizedTail)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) return null
    throw error
  }

  return (data as SnapshotRow | null) ?? null
}

async function writeSnapshot(
  service: SupabaseClient,
  normalizedTail: string,
  result: FAALookupResult,
  source: string,
  rawPayload: Record<string, unknown>
) {
  const { error } = await service
    .from('aircraft_registry_snapshots')
    .upsert(
      {
        tail_number: result.tail_number,
        normalized_tail: normalizedTail,
        source,
        raw_payload: rawPayload,
        make: result.make,
        model: result.model,
        year: result.year ?? null,
        serial_number: result.serial_number ?? null,
        engine_make: result.engine_make ?? null,
        engine_model: result.engine_model ?? null,
        registrant_name: result.registrant_name ?? null,
        registrant_city: result.registrant_city ?? null,
        registrant_state: result.registrant_state ?? null,
        registrant_zip: result.registrant_zip ?? null,
        registrant_type: result.registrant_type ?? null,
        registrant_country: result.registrant_country ?? null,
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'normalized_tail' }
    )

  if (error && !isMissingTableError(error)) {
    throw error
  }
}

async function writeSyncLog(
  service: SupabaseClient,
  payload: {
    normalizedTail: string
    tailNumber: string
    cacheStatus: CacheStatus
    syncStatus: SyncStatus
    source: string
    message?: string
    rawPayload?: Record<string, unknown>
  }
) {
  const { error } = await service.from('aircraft_registry_sync_logs').insert({
    normalized_tail: payload.normalizedTail,
    tail_number: payload.tailNumber,
    cache_status: payload.cacheStatus,
    sync_status: payload.syncStatus,
    source: payload.source,
    message: payload.message ?? null,
    raw_payload: payload.rawPayload ?? {},
  })

  if (error && !isMissingTableError(error)) {
    throw error
  }
}

async function fetchFAARecord(
  nNumber: string
): Promise<{ result: FAALookupResult; source: string; rawPayload: Record<string, unknown> } | null> {
  const upstreamIssues: string[] = []
  let upstreamUnavailable = false
  const primaryUrl = `https://registry.faa.gov/aircraftinquiry/api/NNumInquiry/${encodeURIComponent(nNumber)}`
  try {
    const primaryResponse = await fetch(primaryUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MyAircraft/1.0 (aircraft management platform)',
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })

    if (primaryResponse.ok) {
      const raw = (await primaryResponse.json()) as Record<string, unknown>
      const result = parseFAAResponse(nNumber, raw)
      if (result) {
        return {
          result,
          source: 'faa_registry_api',
          rawPayload: raw,
        }
      }
    }
    else {
      if ([401, 403, 429].includes(primaryResponse.status) || primaryResponse.status >= 500) {
        upstreamUnavailable = true
        upstreamIssues.push(`registry.faa.gov returned ${primaryResponse.status}`)
      }
    }
  } catch (error) {
    upstreamUnavailable = true
    upstreamIssues.push(
      error instanceof Error ? `registry.faa.gov ${error.message}` : 'registry.faa.gov request failed'
    )
  }

  const fallbackUrl = `https://av-info.faa.gov/api/Aircraft/AcftRef?NNum=${encodeURIComponent(nNumber)}`
  try {
    const fallbackResponse = await fetch(fallbackUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })

    if (fallbackResponse.ok) {
      const raw = (await fallbackResponse.json()) as Record<string, unknown>
      const result = parseAvInfoResponse(nNumber, raw)
      if (result) {
        return {
          result,
          source: 'faa_av_info_api',
          rawPayload: raw,
        }
      }
      return null
    }

    if ([401, 403, 429].includes(fallbackResponse.status) || fallbackResponse.status >= 500) {
      upstreamUnavailable = true
      upstreamIssues.push(`av-info.faa.gov returned ${fallbackResponse.status}`)
    }
  } catch (error) {
    upstreamUnavailable = true
    upstreamIssues.push(
      error instanceof Error ? `av-info.faa.gov ${error.message}` : 'av-info.faa.gov request failed'
    )
  }

  const htmlFallbackUrl = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(
    normalizedTailNumber(nNumber)
  )}`
  try {
    const htmlResponse = await fetch(htmlFallbackUrl, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0 (compatible; MyAircraft/1.0)',
      },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })

    if (htmlResponse.ok) {
      const rawHtml = await htmlResponse.text()
      const result = parseFaaHtmlResult(nNumber, rawHtml)
      if (result) {
        return {
          result,
          source: 'faa_registry_html',
          rawPayload: {
            source: 'faa_registry_html',
            htmlSnippet: rawHtml.slice(0, 4000),
          },
        }
      }
      return null
    }

    if ([401, 403, 429].includes(htmlResponse.status) || htmlResponse.status >= 500) {
      upstreamUnavailable = true
      upstreamIssues.push(`registry.faa.gov HTML lookup returned ${htmlResponse.status}`)
    }
  } catch (error) {
    upstreamUnavailable = true
    upstreamIssues.push(
      error instanceof Error ? `registry.faa.gov HTML lookup ${error.message}` : 'registry.faa.gov HTML lookup failed'
    )
  }

  if (upstreamUnavailable) {
    throw new Error(
      `FAA Registry unavailable${upstreamIssues.length ? `: ${upstreamIssues.join('; ')}` : ''}`
    )
  }

  return null
}

function normalizedTailNumber(nNumber: string): string {
  return nNumber.replace(/^N/i, '')
}

export async function lookupTailNumber(
  service: SupabaseClient,
  inputTail: string
): Promise<LookupOutcome | null> {
  const normalized = normalizeTailNumber(inputTail)
  if (!normalized) return null

  const freshnessCutoff = Date.now() - getFreshnessHours() * 60 * 60 * 1000
  const snapshot = await readSnapshot(service, normalized.normalized)

  if (snapshot) {
    const fetchedAt = new Date(snapshot.fetched_at).getTime()
    if (Number.isFinite(fetchedAt) && fetchedAt >= freshnessCutoff) {
      const result = snapshotToLookup(snapshot)
      await writeSyncLog(service, {
        normalizedTail: normalized.normalized,
        tailNumber: result.tail_number,
        cacheStatus: 'hit_fresh',
        syncStatus: 'cache_hit',
        source: snapshot.source,
      }).catch(() => {})
      return {
        result,
        cacheStatus: 'hit_fresh',
        source: snapshot.source,
      }
    }
  }

  try {
    const fetched = await fetchFAARecord(normalized.normalized)
    if (!fetched) {
      if (snapshot) {
        const result = snapshotToLookup(snapshot)
        await writeSyncLog(service, {
          normalizedTail: normalized.normalized,
          tailNumber: result.tail_number,
          cacheStatus: 'hit_stale',
          syncStatus: 'cache_hit',
          source: snapshot.source,
          message: 'FAA did not return a match; stale cache served',
        }).catch(() => {})
        return {
          result,
          cacheStatus: 'hit_stale',
          source: snapshot.source,
        }
      }

      await writeSyncLog(service, {
        normalizedTail: normalized.normalized,
        tailNumber: normalized.normalized,
        cacheStatus: snapshot ? 'hit_stale' : 'miss',
        syncStatus: 'unmatched',
        source: 'faa_lookup',
        message: 'Aircraft not found in FAA registry',
      }).catch(() => {})
      return null
    }

    await writeSnapshot(
      service,
      normalized.normalized,
      fetched.result,
      fetched.source,
      fetched.rawPayload
    )

    await writeSyncLog(service, {
      normalizedTail: normalized.normalized,
      tailNumber: fetched.result.tail_number,
      cacheStatus: snapshot ? 'refreshed' : 'miss',
      syncStatus: 'success',
      source: fetched.source,
      rawPayload: fetched.rawPayload,
    }).catch(() => {})

    return {
      result: fetched.result,
      cacheStatus: snapshot ? 'refreshed' : 'miss',
      source: fetched.source,
    }
  } catch (error) {
    if (snapshot) {
      const result = snapshotToLookup(snapshot)
      await writeSyncLog(service, {
        normalizedTail: normalized.normalized,
        tailNumber: result.tail_number,
        cacheStatus: 'hit_stale',
        syncStatus: 'failed',
        source: snapshot.source,
        message: error instanceof Error ? error.message : 'FAA lookup failed',
      }).catch(() => {})
      return {
        result,
        cacheStatus: 'hit_stale',
        source: snapshot.source,
      }
    }

    await writeSyncLog(service, {
      normalizedTail: normalized.normalized,
      tailNumber: normalized.normalized,
      cacheStatus: 'failed',
      syncStatus: 'failed',
      source: 'faa_lookup',
      message: error instanceof Error ? error.message : 'FAA lookup failed',
    }).catch(() => {})

    throw error
  }
}
