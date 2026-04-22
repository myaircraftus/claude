import { createServiceSupabase } from '@/lib/supabase/server'
import type { RetrievedChunk, DocType } from '@/types'
import { parseStructuredQuery, type ParsedQueryIntent } from './query-parser'

const SEARCH_STOP_WORDS = new Set([
  'A',
  'AN',
  'AND',
  'ABOUT',
  'ARE',
  'DO',
  'DOES',
  'DID',
  'FOR',
  'HOW',
  'IN',
  'IS',
  'ME',
  'MY',
  'OF',
  'ON',
  'SHOW',
  'THE',
  'TO',
  'WAS',
  'WHAT',
  'WHEN',
  'WITH',
  'YOUR',
])

function extractMeaningfulTokens(queryText: string) {
  return Array.from(
    new Set(
      queryText
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token))
    )
  )
}

function buildQueryPhrases(queryText: string) {
  const words = queryText
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token))

  const phrases = new Set<string>()

  for (let index = 0; index < words.length; index += 1) {
    if (index + 1 < words.length) {
      phrases.add(`${words[index]} ${words[index + 1]}`)
    }
    if (index + 2 < words.length) {
      phrases.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`)
    }
  }

  return Array.from(phrases).filter((phrase) => phrase.trim().length >= 5)
}

function buildQueryAliases(queryText: string) {
  const normalized = queryText.toUpperCase()
  const aliases = new Set<string>()

  if (/OVERHAUL/.test(normalized)) {
    aliases.add('SMOH')
    aliases.add('TSMO')
    aliases.add('SINCE MAJOR OVERHAUL')
    aliases.add('MAJOR OVERHAUL')
    aliases.add('COMPLETE OVERHAUL')
    aliases.add('REINSTALLED AFTER OVERHAUL')
  }

  if (/100[\s-]*HOUR/.test(normalized)) {
    aliases.add('100 HOUR')
    aliases.add('100-HOUR')
  }

  if (/ANNUAL/.test(normalized) && /INSPECTION/.test(normalized)) {
    aliases.add('ANNUAL INSPECTION')
  }

  return Array.from(aliases)
}

function isMaintenanceHistoryQuery(queryText: string) {
  return /(ANNUAL|INSPECTION|OVERHAUL|SMOH|100[\s-]*HOUR|LOGBOOK|HISTORY|OIL CHANGE)/i.test(queryText)
}

function isAnnualInspectionQuery(queryText: string) {
  return /ANNUAL/i.test(queryText) && /INSPECTION/i.test(queryText)
}

function isOverhaulQuery(queryText: string) {
  return /(OVERHAUL|SMOH|SINCE MAJOR OVERHAUL|MAJOR OVERHAUL)/i.test(queryText)
}

function asksForEngineLogbook(queryText: string) {
  return /ENGINE\s+LOGBOOK/i.test(queryText)
}

function asksForAirframeLogbook(queryText: string) {
  return /AIRFRAME\s+LOGBOOK/i.test(queryText)
}

function asksForPropellerLogbook(queryText: string) {
  return /(PROP|PROPELLER)\s+LOGBOOK/i.test(queryText)
}

function prefersLatestRecords(queryText: string) {
  return /\b(LAST|LATEST|MOST RECENT|RECENT|CURRENT)\b/i.test(queryText)
}

function prefersLatestInspectionRecord(queryText: string) {
  return (
    prefersLatestRecords(queryText) &&
    /(ANNUAL|INSPECTION|100[\s-]*HOUR|MAINTENANCE)/i.test(queryText)
  )
}

function looksLikeEngineLog(title: string, detailId?: string) {
  return /(^|[^A-Z])ENG(?:INE)?([^A-Z]|$)|SMOH|OVERHAUL|PROP_LOGBOOK|PROP/i.test(title) ||
    detailId === 'engine_logbooks' ||
    detailId === 'propeller_logbooks'
}

function looksLikeAirframeLog(title: string, detailId?: string) {
  return /AFM_LOGBOOK|AF_LOGBOOK|AIRFRAME|AIRFRAME_ESIGNEDRECORD/i.test(title) || detailId === 'airframe_logbooks'
}

function looksLikePropellerLog(title: string, detailId?: string) {
  return /PROP_LOGBOOK|PROPELLER|PROPELLER_ESIGNEDRECORD/i.test(title) || detailId === 'propeller_logbooks'
}

function isInternalReferenceChunk(chunk: RetrievedChunk) {
  const title = chunk.document_title.toUpperCase()
  const text = chunk.chunk_text.toUpperCase()

  if (
    title.includes('BLUETAIL') ||
    title.includes('SYSTEM_DOCUMENTATION') ||
    title.includes('DEDUPE') ||
    title.includes('REFERENCE') ||
    title.includes('[CODEX') ||
    title.includes('SMOKE TEST')
  ) {
    return true
  }

  return (
    text.includes('DEVELOPER REFERENCE DOCUMENT') ||
    text.includes("WHAT WE'RE BUILDING AND WHY") ||
    text.includes('BLUETAIL.AERO') ||
    text.includes('PLATFORM OVERVIEW') ||
    text.includes('CONFIDENTIAL')
  )
}

function hasStrongOverhaulEventText(text: string) {
  return /REMOVED[_ ]FROM.*MAJOR OVERHAUL|REMOVED FOR MAJOR OVERHAUL|REINSTALLED THIS\s+ENGINE|REINSTALLED AFTER OVERHAUL|THIS ENGINE WAS COMPLETELY DISASSEMBLED|REASSEMBLED ENGINE TO NEW LIMITS|ENGINE OVERHAUL SIGN-OFF|FOR MAJOR OVERHAUL DUE TO/i.test(text)
}

function hasOverhaulSignal(text: string) {
  return /(OVERHAUL|SMOH|TSMO|SINCE MAJOR OVERHAUL|OVERHAULED)/i.test(text)
}

function documentRelevanceAdjustment(queryText: string, chunk: RetrievedChunk) {
  let adjustment = 0
  const title = chunk.document_title.toUpperCase()
  const text = chunk.chunk_text.toUpperCase()

  if (isInternalReferenceChunk(chunk)) {
    adjustment -= 0.9
  }

  if (chunk.truth_role === 'source_of_truth') {
    adjustment += 0.28
  } else if (chunk.truth_role === 'supporting_evidence') {
    adjustment += 0.08
  } else if (chunk.truth_role === 'derived_summary') {
    adjustment -= 0.12
  }

  if (
    isMaintenanceHistoryQuery(queryText) &&
    chunk.document_detail_id === 'master_document_register'
  ) {
    adjustment -= 0.55
  }

  if (chunk.completeness_relevance === false) {
    adjustment -= 0.08
  }

  if (isMaintenanceHistoryQuery(queryText)) {
    if (chunk.doc_type === 'logbook' || /LOGBOOK/i.test(title)) {
      adjustment += 0.18
    }

    if (isAnnualInspectionQuery(queryText) && looksLikeAirframeLog(title, chunk.document_detail_id)) {
      adjustment += 0.24
    }

    if (
      isAnnualInspectionQuery(queryText) &&
      !asksForPropellerLogbook(queryText) &&
      looksLikePropellerLog(title, chunk.document_detail_id)
    ) {
      adjustment -= 0.32
    }

    if (
      isAnnualInspectionQuery(queryText) &&
      !asksForEngineLogbook(queryText) &&
      chunk.document_detail_id === 'engine_logbooks'
    ) {
      adjustment -= 0.18
    }

    if (isOverhaulQuery(queryText) && looksLikeEngineLog(title, chunk.document_detail_id)) {
      adjustment += 0.22
    }
  }

  if (asksForEngineLogbook(queryText)) {
    if (chunk.document_detail_id === 'engine_logbooks' || looksLikeEngineLog(title, chunk.document_detail_id)) {
      adjustment += 0.35
    } else if (chunk.document_detail_id === 'airframe_logbooks' || looksLikeAirframeLog(title, chunk.document_detail_id)) {
      adjustment -= 1.8
    }
  }

  if (asksForAirframeLogbook(queryText)) {
    if (chunk.document_detail_id === 'airframe_logbooks' || looksLikeAirframeLog(title, chunk.document_detail_id)) {
      adjustment += 0.35
    } else if (chunk.document_detail_id === 'engine_logbooks' || looksLikeEngineLog(title, chunk.document_detail_id)) {
      adjustment -= 0.35
    }
  }

  if (asksForPropellerLogbook(queryText)) {
    if (chunk.document_detail_id === 'propeller_logbooks' || /PROP/i.test(title)) {
      adjustment += 0.35
    } else if (chunk.document_detail_id === 'engine_logbooks' || chunk.document_detail_id === 'airframe_logbooks') {
      adjustment -= 0.2
    }
  }

  if (isOverhaulQuery(queryText)) {
    if (!hasOverhaulSignal(text)) {
      adjustment -= 1.4
    }

    if (/RECOMMENDED OVERHAUL/.test(text)) {
      adjustment -= 0.35
    }

    if (/ENGINE IS CURRENTLY INSTALLED IN AIRCRAFT|GENERAL INFORMATION|ANNUAL ENGING|ANNUAL ENGINE/i.test(text)) {
      adjustment -= 0.4
    }

    if (asksForEngineLogbook(queryText) && (chunk.document_detail_id === 'airframe_logbooks' || looksLikeAirframeLog(title, chunk.document_detail_id))) {
      adjustment -= 1.2
    }

    if (hasStrongOverhaulEventText(text)) {
      adjustment += 1.05
    } else if (/COMPLETE OVERHAUL|MAJOR OVERHAUL|OVERHAULED/i.test(text)) {
      adjustment += 0.45
    } else if (/TSMO[:\s]|SMOH[:\s]|SINCE SMOH|SINCE MAJOR OVERHAUL/i.test(text)) {
      adjustment += 0.12
    }
  }

  return adjustment
}

function collapseDuplicatePages(chunks: RetrievedChunk[]) {
  const byPage = new Map<string, RetrievedChunk>()

  for (const chunk of chunks) {
    const key = `${chunk.document_id}:${chunk.page_number}:${chunk.page_number_end ?? chunk.page_number}`
    const existing = byPage.get(key)
    if (!existing || chunk.combined_score > existing.combined_score) {
      byPage.set(key, chunk)
    }
  }

  return Array.from(byPage.values())
}

function coerceFiniteNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function mapRpcRow(row: Record<string, unknown>): RetrievedChunk {
  return {
    chunk_id: row.chunk_id as string,
    document_id: row.document_id as string,
    document_title: row.document_title as string,
    doc_type: row.doc_type as DocType,
    truth_role: (row.truth_role as string | undefined) ?? undefined,
    document_group_id: (row.document_group_id as string | undefined) ?? undefined,
    document_detail_id: (row.document_detail_id as string | undefined) ?? undefined,
    completeness_relevance:
      typeof row.completeness_relevance === 'boolean' ? row.completeness_relevance : undefined,
    aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
    aircraft_tail: (row.tail_number as string | undefined) ?? undefined,
    page_number: row.page_number as number,
    page_number_end: (row.page_number_end as number | undefined) ?? undefined,
    section_title: (row.section_title as string | undefined) ?? undefined,
    chunk_text: row.chunk_text as string,
    metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
    vector_score: coerceFiniteNumber(row.vector_score, 0),
    keyword_score: coerceFiniteNumber(row.keyword_score, 0),
    combined_score: coerceFiniteNumber(row.combined_score, 0),
  }
}

function normalizeDateStart(raw?: string): string | null {
  if (!raw) return null
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function normalizeDateEnd(raw?: string): string | null {
  if (!raw) return null
  if (/^\d{4}$/.test(raw)) return `${raw}-12-31`
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split('-').map((value) => parseInt(value, 10))
    const day = new Date(year, month, 0).getDate()
    return `${raw}-${String(day).padStart(2, '0')}`
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

function localKeywordScore(queryText: string, chunk: RetrievedChunk): number {
  const haystack = [
    chunk.document_title,
    chunk.section_title,
    chunk.chunk_text,
    chunk.aircraft_tail,
    JSON.stringify(chunk.metadata_json ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  const tokens = extractMeaningfulTokens(queryText)

  if (tokens.length === 0) return 0

  let matches = 0
  for (const token of tokens) {
    if (haystack.includes(token)) matches += 1
  }

  return matches / tokens.length
}

function phraseSearchBoost(queryText: string, chunk: RetrievedChunk): number {
  const haystack = [
    chunk.document_title,
    chunk.section_title,
    chunk.chunk_text,
    chunk.aircraft_tail,
    JSON.stringify(chunk.metadata_json ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  const phrases = [...buildQueryPhrases(queryText), ...buildQueryAliases(queryText)]
  if (phrases.length === 0) return 0

  let boost = 0
  for (const phrase of phrases) {
    if (haystack.includes(phrase)) {
      boost += phrase.split(' ').length >= 3 ? 0.18 : 0.12
    }
  }

  return Math.min(0.42, boost)
}

function structuredScoreBoost(chunk: RetrievedChunk, intent: ParsedQueryIntent): number {
  const haystack = [
    chunk.document_title,
    chunk.section_title,
    chunk.chunk_text,
    chunk.aircraft_tail,
    JSON.stringify(chunk.metadata_json ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()

  let boost = 0

  if (intent.aircraftTail && chunk.aircraft_tail?.toUpperCase() === intent.aircraftTail) {
    boost += 0.25
  }

  if (intent.docTypeFilter?.includes(chunk.doc_type)) {
    boost += 0.05
  }

  for (const adRef of intent.adReferences) {
    if (haystack.includes(adRef)) boost += 0.12
  }

  for (const sbRef of intent.sbReferences) {
    if (haystack.includes(sbRef)) boost += 0.12
  }

  for (const partNumber of intent.partNumbers) {
    if (haystack.includes(partNumber)) boost += 0.1
  }

  for (const ataChapter of intent.ataChapters) {
    if (haystack.includes(ataChapter)) boost += 0.08
  }

  return boost
}

async function applyDocumentDateFilters(
  chunks: RetrievedChunk[],
  intent: ParsedQueryIntent
): Promise<RetrievedChunk[]> {
  const afterDate = normalizeDateStart(intent.afterDate)
  const beforeDate = normalizeDateEnd(intent.beforeDate)

  if ((!afterDate && !beforeDate) || chunks.length === 0) {
    return chunks
  }

  const supabase = createServiceSupabase()
  const documentIds = Array.from(new Set(chunks.map((chunk) => chunk.document_id)))
  const { data, error } = await supabase
    .from('documents')
    .select('id, document_date, uploaded_at')
    .in('id', documentIds)

  if (error || !data) {
    return chunks
  }

  const byId = new Map(
    (data as Array<{ id: string; document_date?: string | null; uploaded_at?: string | null }>).map(
      (row) => [row.id, String(row.document_date ?? row.uploaded_at ?? '')]
    )
  )

  const filtered = chunks.filter((chunk) => {
    const sourceDate = byId.get(chunk.document_id)
    if (!sourceDate) return true
    if (afterDate && sourceDate < afterDate) return false
    if (beforeDate && sourceDate > beforeDate) return false
    return true
  })

  return filtered.length > 0 ? filtered : chunks
}

async function hydrateDocumentMetadata(chunks: RetrievedChunk[]) {
  if (chunks.length === 0) return chunks

  const supabase = createServiceSupabase()
  const documentIds = Array.from(new Set(chunks.map((chunk) => chunk.document_id)))
  const { data, error } = await supabase
    .from('documents')
    .select('id, truth_role, document_group_id, document_detail_id, completeness_relevance, document_date, uploaded_at')
    .in('id', documentIds)

  if (error || !data) {
    return chunks
  }

  const byId = new Map(
    (
      data as Array<{
        id: string
        truth_role?: string | null
        document_group_id?: string | null
        document_detail_id?: string | null
        completeness_relevance?: boolean | null
        document_date?: string | null
        uploaded_at?: string | null
      }>
    ).map((row) => [
      row.id,
      {
        truth_role: row.truth_role ?? undefined,
        document_group_id: row.document_group_id ?? undefined,
        document_detail_id: row.document_detail_id ?? undefined,
        completeness_relevance:
          typeof row.completeness_relevance === 'boolean' ? row.completeness_relevance : undefined,
        document_date: row.document_date ?? undefined,
        uploaded_at: row.uploaded_at ?? undefined,
      },
    ])
  )

  return chunks.map((chunk) => {
    const metadata = byId.get(chunk.document_id)
    if (!metadata) return chunk
    return {
      ...chunk,
      ...metadata,
    }
  })
}

function scoreRecencyPreference(chunks: RetrievedChunk[], queryText: string) {
  if (!prefersLatestInspectionRecord(queryText) || chunks.length === 0) {
    return chunks
  }

  const extractLatestYear = (chunk: RetrievedChunk) => {
    const sources = [
      chunk.document_date ?? '',
      chunk.document_title,
      chunk.chunk_text.slice(0, 320),
    ]
    const matches = sources
      .flatMap((value) => Array.from(value.matchAll(/\b(19[5-9]\d|20[0-3]\d)\b/g)))
      .map((match) => Number.parseInt(match[1], 10))
      .filter((year) => Number.isFinite(year))

    if (matches.length === 0) return null
    return Math.max(...matches)
  }

  const yearCandidates = chunks
    .map((chunk) => ({ chunk, year: extractLatestYear(chunk) }))
    .filter((entry): entry is { chunk: RetrievedChunk; year: number } => entry.year != null)

  if (yearCandidates.length === 0) {
    return chunks
  }

  const latestYear = yearCandidates.reduce((latest, entry) => (
    entry.year > latest ? entry.year : latest
  ), yearCandidates[0].year)

  return chunks.map((chunk) => {
    const year = extractLatestYear(chunk)
    if (year == null) return chunk

    let bonus = 0
    if (year === latestYear) {
      bonus = 0.55
    } else if (year >= latestYear - 1) {
      bonus = 0.32
    } else if (year >= latestYear - 3) {
      bonus = 0.18
    } else if (year >= latestYear - 8) {
      bonus = 0.08
    }

    if (isMaintenanceHistoryQuery(queryText) && chunk.truth_role === 'source_of_truth') {
      bonus += 0.06
    }

    return {
      ...chunk,
      combined_score: chunk.combined_score + bonus,
    }
  })
}

async function runKeywordFallback(params: {
  organizationId: string
  aircraftId?: string
  queryText: string
  docTypeFilter?: DocType[]
  limit: number
}): Promise<RetrievedChunk[]> {
  if (!params.queryText.trim()) return []

  const supabase = createServiceSupabase()

  let query = supabase
    .from('canonical_document_chunks')
    .select(
      `
      id,
      document_id,
      aircraft_id,
      page_number,
      page_number_end,
      section_title,
      chunk_text,
      metadata_json,
      documents:document_id!inner (
        title,
        doc_type,
        parsing_status
      ),
      aircraft:aircraft_id (
        tail_number
      )
    `
    )
    .eq('organization_id', params.organizationId)
    .neq('documents.parsing_status', 'failed')
    .textSearch('chunk_text_tsv', params.queryText, { type: 'plain' })
    .limit(params.limit * 3)

  if (params.aircraftId) {
    query = query.eq('aircraft_id', params.aircraftId)
  }

  if (params.docTypeFilter && params.docTypeFilter.length > 0) {
    query = query.in('documents.doc_type', params.docTypeFilter)
  }

  const { data, error } = await query

  if (error || !data || !Array.isArray(data)) {
    return []
  }

  return data
    .map((row: any) => {
      const document = Array.isArray(row.documents) ? row.documents[0] : row.documents
      const aircraft = Array.isArray(row.aircraft) ? row.aircraft[0] : row.aircraft
      const chunk: RetrievedChunk = {
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        document_title: document?.title ?? 'Untitled document',
        doc_type: document?.doc_type as DocType,
        aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
        aircraft_tail: aircraft?.tail_number ?? undefined,
        page_number: row.page_number as number,
        page_number_end: (row.page_number_end as number | undefined) ?? undefined,
        section_title: (row.section_title as string | undefined) ?? undefined,
        chunk_text: row.chunk_text as string,
        metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
        vector_score: 0,
        keyword_score: localKeywordScore(params.queryText, {
          chunk_id: row.id as string,
          document_id: row.document_id as string,
          document_title: document?.title ?? 'Untitled document',
          doc_type: document?.doc_type as DocType,
          aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
          aircraft_tail: aircraft?.tail_number ?? undefined,
          page_number: row.page_number as number,
          page_number_end: (row.page_number_end as number | undefined) ?? undefined,
          section_title: (row.section_title as string | undefined) ?? undefined,
          chunk_text: row.chunk_text as string,
          metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
          vector_score: 0,
          keyword_score: 0,
          combined_score: 0,
        }),
        combined_score: 0,
      }

      chunk.combined_score = chunk.keyword_score
      return chunk
    })
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, params.limit)
}

function escapeIlikeValue(value: string) {
  return value.replace(/[%_,]/g, ' ')
}

async function runPhraseFallback(params: {
  organizationId: string
  aircraftId?: string
  queryText: string
  docTypeFilter?: DocType[]
  limit: number
}): Promise<RetrievedChunk[]> {
  const phrases = [...buildQueryPhrases(params.queryText), ...buildQueryAliases(params.queryText)]
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)

  if (phrases.length === 0) return []

  const supabase = createServiceSupabase()
  const merged = new Map<string, RetrievedChunk>()

  for (const phrase of phrases) {
    const pattern = `%${escapeIlikeValue(phrase)}%`

    let query = supabase
      .from('canonical_document_chunks')
      .select(
        `
        id,
        document_id,
        aircraft_id,
        page_number,
        page_number_end,
        section_title,
        chunk_text,
        metadata_json,
        documents:document_id!inner (
          title,
          doc_type,
          parsing_status
        ),
        aircraft:aircraft_id (
          tail_number
        )
      `
      )
      .eq('organization_id', params.organizationId)
      .neq('documents.parsing_status', 'failed')
      .or(`chunk_text.ilike.${pattern},section_title.ilike.${pattern}`)
      .limit(params.limit)

    if (params.aircraftId) {
      query = query.eq('aircraft_id', params.aircraftId)
    }

    if (params.docTypeFilter && params.docTypeFilter.length > 0) {
      query = query.in('documents.doc_type', params.docTypeFilter)
    }

    const { data, error } = await query
    if (error || !Array.isArray(data)) {
      continue
    }

    for (const row of data) {
      const document = Array.isArray((row as any).documents) ? (row as any).documents[0] : (row as any).documents
      const aircraft = Array.isArray((row as any).aircraft) ? (row as any).aircraft[0] : (row as any).aircraft
      const chunk: RetrievedChunk = {
        chunk_id: (row as any).id as string,
        document_id: (row as any).document_id as string,
        document_title: document?.title ?? 'Untitled document',
        doc_type: document?.doc_type as DocType,
        aircraft_id: ((row as any).aircraft_id as string | undefined) ?? undefined,
        aircraft_tail: aircraft?.tail_number ?? undefined,
        page_number: (row as any).page_number as number,
        page_number_end: ((row as any).page_number_end as number | undefined) ?? undefined,
        section_title: ((row as any).section_title as string | undefined) ?? undefined,
        chunk_text: (row as any).chunk_text as string,
        metadata_json: ((row as any).metadata_json as Record<string, unknown>) ?? {},
        vector_score: 0,
        keyword_score: 1,
        combined_score: phrase.split(' ').length >= 3 ? 0.55 : 0.45,
      }

      const existing = merged.get(chunk.chunk_id)
      if (!existing || chunk.combined_score > existing.combined_score) {
        merged.set(chunk.chunk_id, chunk)
      }
    }
  }

  return Array.from(merged.values())
}

async function runRawChunkFallback(params: {
  organizationId: string
  aircraftId?: string
  queryText: string
  docTypeFilter?: DocType[]
  limit: number
}): Promise<RetrievedChunk[]> {
  const searchTerms = Array.from(
    new Set([
      ...buildQueryAliases(params.queryText),
      ...extractMeaningfulTokens(params.queryText).filter((token) => token.length >= 4),
    ])
  ).slice(0, 8)

  if (searchTerms.length === 0) return []

  const supabase = createServiceSupabase()
  const filters = searchTerms.flatMap((term) => {
    const pattern = `%${escapeIlikeValue(term)}%`
    return [`chunk_text.ilike.${pattern}`, `section_title.ilike.${pattern}`]
  })

  const rawFallbackLimit = isMaintenanceHistoryQuery(params.queryText)
    ? Math.max(params.limit * 50, 600)
    : Math.max(params.limit * 12, 60)

  let query = supabase
    .from('document_chunks')
    .select(
      `
      id,
      document_id,
      aircraft_id,
      page_number,
      page_number_end,
      section_title,
      chunk_text,
      metadata_json,
      documents:document_id!inner (
        title,
        doc_type,
        parsing_status
      ),
      aircraft:aircraft_id (
        tail_number
      )
    `
    )
    .eq('organization_id', params.organizationId)
    .neq('documents.parsing_status', 'failed')
    .or(filters.join(','))
    .limit(rawFallbackLimit)

  if (params.aircraftId) {
    query = query.eq('aircraft_id', params.aircraftId)
  }

  if (params.docTypeFilter && params.docTypeFilter.length > 0) {
    query = query.in('documents.doc_type', params.docTypeFilter)
  }

  const { data, error } = await query
  if (error || !Array.isArray(data)) {
    return []
  }

  return data.map((row: any) => {
    const document = Array.isArray(row.documents) ? row.documents[0] : row.documents
    const aircraft = Array.isArray(row.aircraft) ? row.aircraft[0] : row.aircraft
    const chunk: RetrievedChunk = {
      chunk_id: row.id as string,
      document_id: row.document_id as string,
      document_title: document?.title ?? 'Untitled document',
      doc_type: document?.doc_type as DocType,
      aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
      aircraft_tail: aircraft?.tail_number ?? undefined,
      page_number: row.page_number as number,
      page_number_end: (row.page_number_end as number | undefined) ?? undefined,
      section_title: (row.section_title as string | undefined) ?? undefined,
      chunk_text: row.chunk_text as string,
      metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
      vector_score: 0,
      keyword_score: localKeywordScore(params.queryText, {
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        document_title: document?.title ?? 'Untitled document',
        doc_type: document?.doc_type as DocType,
        aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
        aircraft_tail: aircraft?.tail_number ?? undefined,
        page_number: row.page_number as number,
        page_number_end: (row.page_number_end as number | undefined) ?? undefined,
        section_title: (row.section_title as string | undefined) ?? undefined,
        chunk_text: row.chunk_text as string,
        metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
        vector_score: 0,
        keyword_score: 0,
        combined_score: 0,
      }),
      combined_score: 0.2,
    }

    chunk.combined_score = chunk.keyword_score * 0.35 + phraseSearchBoost(params.queryText, chunk) + 0.2
    return chunk
  })
}

/**
 * Retrieve semantically relevant chunks from the aircraft documents index.
 * Adds tail-aware resolution, lightweight structured query parsing, and
 * a keyword-search fallback when the RPC path comes back empty.
 */
export async function retrieveChunks(params: {
  organizationId: string
  aircraftId?: string
  queryEmbedding: number[]
  queryText: string
  docTypeFilter?: DocType[]
  limit?: number
  parsedQuery?: ParsedQueryIntent
}): Promise<RetrievedChunk[]> {
  const limit = params.limit ?? 20
  const supabase = createServiceSupabase()
  const parsedQuery =
    params.parsedQuery ??
    (await parseStructuredQuery({
      organizationId: params.organizationId,
      aircraftId: params.aircraftId,
      docTypeFilter: params.docTypeFilter,
      queryText: params.queryText,
    }))

  const effectiveQueryText = parsedQuery.cleanedQuery || params.queryText
  const effectiveAircraftId = parsedQuery.aircraftId ?? params.aircraftId
  const effectiveDocTypeFilter = parsedQuery.docTypeFilter

  let rpcChunks: RetrievedChunk[] = []

  try {
    const { data, error } = await supabase.rpc('search_canonical_documents', {
      p_organization_id: params.organizationId,
      p_aircraft_id: effectiveAircraftId ?? null,
      p_query_embedding: params.queryEmbedding,
      p_query_text: effectiveQueryText,
      p_doc_type_filter:
        effectiveDocTypeFilter && effectiveDocTypeFilter.length > 0
          ? effectiveDocTypeFilter
          : null,
      p_limit: limit,
    })

    if (error) {
      throw new Error(error.message)
    }

    if (Array.isArray(data)) {
      rpcChunks = data.map((row: Record<string, unknown>) => mapRpcRow(row))
    }
  } catch (error) {
    console.error('[rag/retrieval] search_canonical_documents failed:', error)
  }

  let chunks = rpcChunks

  const keywordChunks = await runKeywordFallback({
    organizationId: params.organizationId,
    aircraftId: effectiveAircraftId,
    queryText: effectiveQueryText,
    docTypeFilter: effectiveDocTypeFilter,
    limit,
  })
  const phraseChunks = await runPhraseFallback({
    organizationId: params.organizationId,
    aircraftId: effectiveAircraftId,
    queryText: effectiveQueryText,
    docTypeFilter: effectiveDocTypeFilter,
    limit,
  })
  const rawChunks =
    isMaintenanceHistoryQuery(effectiveQueryText) || chunks.length === 0
      ? await runRawChunkFallback({
          organizationId: params.organizationId,
          aircraftId: effectiveAircraftId,
          queryText: effectiveQueryText,
          docTypeFilter: effectiveDocTypeFilter,
          limit,
        })
      : []

  if (chunks.length === 0) {
    chunks = [...phraseChunks, ...keywordChunks, ...rawChunks]
  } else if (keywordChunks.length > 0 || phraseChunks.length > 0 || rawChunks.length > 0) {
    const merged = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]))
    for (const chunk of [...keywordChunks, ...phraseChunks, ...rawChunks]) {
      const existing = merged.get(chunk.chunk_id)
      if (!existing) {
        merged.set(chunk.chunk_id, chunk)
        continue
      }
      merged.set(chunk.chunk_id, {
        ...existing,
        keyword_score: Math.max(existing.keyword_score, chunk.keyword_score),
        combined_score: Math.max(existing.combined_score, chunk.combined_score),
      })
    }
    chunks = Array.from(merged.values())
  }

  const filteredByDate = await applyDocumentDateFilters(chunks, parsedQuery)
  const hydratedChunks = await hydrateDocumentMetadata(filteredByDate)

  const rankedChunks = collapseDuplicatePages(
    hydratedChunks
    .map((chunk) => {
      const boost = structuredScoreBoost(chunk, parsedQuery)
      const keywordScore = Math.max(chunk.keyword_score, localKeywordScore(effectiveQueryText, chunk))
      const phraseBoost = phraseSearchBoost(effectiveQueryText, chunk)
      const documentBoost = documentRelevanceAdjustment(effectiveQueryText, chunk)
      return {
        ...chunk,
        keyword_score: keywordScore,
        combined_score: chunk.combined_score + boost + phraseBoost + documentBoost + keywordScore * 0.2,
      }
    })
    .sort((a, b) => b.combined_score - a.combined_score)
  )

  return scoreRecencyPreference(rankedChunks, effectiveQueryText)
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, limit)
}
