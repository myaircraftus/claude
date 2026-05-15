import { formatTaxonomyLabel, normalizeAtaCode } from './format'

export interface AtaChapterRow {
  id: string
  ata_code: string
  title: string
  description?: string | null
  status: string
  source?: string | null
  source_version?: string | null
  source_url?: string | null
}

export interface JascCodeRow {
  id: string
  jasc_code: string
  ata_code: string
  title: string
  definition?: string | null
  status: string
  source?: string | null
  source_version?: string | null
  source_url?: string | null
  applicable_fixed_wing: boolean
  applicable_rotorcraft: boolean
  applicable_piston: boolean
  applicable_turbine: boolean
  applicable_jet: boolean
  applicable_turboprop: boolean
  applicable_single_engine: boolean
  applicable_multi_engine: boolean
  system_level?: boolean
  wiring_code?: boolean
  notes?: string | null
}

export interface AircraftTaxonomyProfile {
  taxonomy_aircraft_kind?: string | null
  taxonomy_engine_type?: string | null
  taxonomy_engine_count?: number | null
  make?: string | null
  model?: string | null
  engine_make?: string | null
  engine_model?: string | null
}

export interface AircraftTaxonomyOverride {
  ata_code: string
  jasc_code?: string | null
  applicable: boolean
  visible_default: boolean
  manufacturer_label?: string | null
}

export function decorateJascCode(row: JascCodeRow, ata?: AtaChapterRow | null) {
  const formatted = formatTaxonomyLabel({
    ata_code: row.ata_code,
    ata_title: ata?.title ?? row.ata_code,
    jasc_code: row.jasc_code,
    jasc_title: row.title,
  })

  return {
    ...row,
    ata_title: ata?.title ?? null,
    label: formatted.label,
    secondary_label: formatted.secondary,
  }
}

export async function fetchAtaChapters(supabase: any): Promise<AtaChapterRow[]> {
  const { data, error } = await supabase
    .from('ata_chapters')
    .select('*')
    .order('ata_code', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchJascCodes(
  supabase: any,
  options: { ataCode?: string | null; limit?: number } = {},
): Promise<JascCodeRow[]> {
  let query = supabase
    .from('jasc_codes')
    .select('*')
    .order('jasc_code', { ascending: true })
    .limit(options.limit ?? 1000)

  if (options.ataCode) query = query.eq('ata_code', normalizeAtaCode(options.ataCode))

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchAircraftTaxonomyOverrides(
  supabase: any,
  aircraftId: string,
): Promise<AircraftTaxonomyOverride[]> {
  const { data, error } = await supabase
    .from('aircraft_taxonomy_applicability')
    .select('ata_code, jasc_code, applicable, visible_default, manufacturer_label')
    .eq('aircraft_id', aircraftId)

  if (error) throw new Error(error.message)
  return data ?? []
}

function inferAircraftKind(aircraft?: AircraftTaxonomyProfile | null) {
  const explicit = aircraft?.taxonomy_aircraft_kind
  if (explicit) return explicit

  const text = `${aircraft?.make ?? ''} ${aircraft?.model ?? ''}`.toLowerCase()
  if (/(bell|robinson|sikorsky|airbus helicopter|helicopter|rotor)/.test(text)) return 'rotorcraft'
  return 'fixed_wing'
}

function inferEngineType(aircraft?: AircraftTaxonomyProfile | null) {
  const explicit = aircraft?.taxonomy_engine_type
  if (explicit) return explicit

  const text = `${aircraft?.engine_make ?? ''} ${aircraft?.engine_model ?? ''} ${aircraft?.make ?? ''} ${aircraft?.model ?? ''}`.toLowerCase()
  if (/(pt6|turboprop|king air|pc-12|tbm)/.test(text)) return 'turboprop'
  if (/(jet|turbofan|citation|phenom|lear|gulfstream|falcon)/.test(text)) return 'jet'
  if (/(turbine|turboshaft)/.test(text)) return 'turbine'
  if (/(lycoming|continental|piston|cessna 1|piper|cirrus|mooney|bonanza)/.test(text)) return 'piston'
  return 'unknown'
}

function passesAircraftDefaults(row: JascCodeRow, aircraft?: AircraftTaxonomyProfile | null) {
  if (!aircraft) return true

  const kind = inferAircraftKind(aircraft)
  if (kind === 'rotorcraft' && !row.applicable_rotorcraft) return false
  if (kind === 'fixed_wing' && !row.applicable_fixed_wing) return false

  const engineType = inferEngineType(aircraft)
  if (engineType === 'piston' && !row.applicable_piston) return false
  if (engineType === 'turboprop' && !row.applicable_turboprop) return false
  if (engineType === 'jet' && !row.applicable_jet) return false
  if (engineType === 'turbine' && !row.applicable_turbine) return false

  const engineCount = aircraft.taxonomy_engine_count
  if (engineCount === 1 && !row.applicable_single_engine) return false
  if (engineCount && engineCount > 1 && !row.applicable_multi_engine) return false

  return true
}

export function filterApplicableJascCodes(
  rows: JascCodeRow[],
  aircraft?: AircraftTaxonomyProfile | null,
  overrides: AircraftTaxonomyOverride[] = [],
) {
  const byJasc = new Map(
    overrides
      .filter((row) => row.jasc_code)
      .map((row) => [row.jasc_code as string, row]),
  )
  const byAta = new Map(
    overrides
      .filter((row) => !row.jasc_code)
      .map((row) => [row.ata_code, row]),
  )

  return rows.filter((row) => {
    const exact = byJasc.get(row.jasc_code)
    if (exact) return exact.applicable && exact.visible_default

    const chapterOverride = byAta.get(row.ata_code)
    if (chapterOverride) return chapterOverride.applicable && chapterOverride.visible_default

    return passesAircraftDefaults(row, aircraft)
  })
}

export function searchTaxonomyRows(
  rows: JascCodeRow[],
  ataByCode: Map<string, AtaChapterRow>,
  query: string,
) {
  const normalized = query.trim().toLowerCase()
  const tokens = normalized.split(/\s+/).filter(Boolean)

  const scored = rows
    .map((row) => {
      const ata = ataByCode.get(row.ata_code)
      const haystack = [
        row.jasc_code,
        row.ata_code,
        row.title,
        row.definition,
        ata?.title,
      ].join(' ').toLowerCase()

      let score = 0
      if (!normalized) score = row.system_level ? 3 : 1
      else {
        if (row.jasc_code === normalized || row.ata_code === normalized) score += 100
        if (row.title.toLowerCase().includes(normalized)) score += 40
        if (ata?.title?.toLowerCase().includes(normalized)) score += 30
        for (const token of tokens) {
          if (haystack.includes(token)) score += 8
        }
      }

      return { row, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.row.jasc_code.localeCompare(b.row.jasc_code))

  return scored.map((entry) => decorateJascCode(entry.row, ataByCode.get(entry.row.ata_code)))
}
