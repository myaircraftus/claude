import type { DocType } from '@/types'
import { normalizeTailNumber } from '@/lib/faa/registry'
import { createServiceSupabase } from '@/lib/supabase/server'

const DOC_TYPE_ALIASES: Record<string, DocType> = {
  logbook: 'logbook',
  logs: 'logbook',
  poh: 'poh',
  afm: 'afm',
  afms: 'afm_supplement',
  supplement: 'afm_supplement',
  supplements: 'afm_supplement',
  manual: 'maintenance_manual',
  maintenance: 'maintenance_manual',
  maintenance_manual: 'maintenance_manual',
  service: 'service_manual',
  service_manual: 'service_manual',
  ipc: 'parts_catalog',
  parts: 'parts_catalog',
  parts_catalog: 'parts_catalog',
  sb: 'service_bulletin',
  bulletin: 'service_bulletin',
  service_bulletin: 'service_bulletin',
  ad: 'airworthiness_directive',
  airworthiness_directive: 'airworthiness_directive',
  wo: 'work_order',
  work_order: 'work_order',
  inspection: 'inspection_report',
  inspection_report: 'inspection_report',
  form337: 'form_337',
  '337': 'form_337',
  form_337: 'form_337',
  stc: 'stc',
  form8130: 'form_8130',
  '8130': 'form_8130',
  form_8130: 'form_8130',
  lease: 'lease_ownership',
  ownership: 'lease_ownership',
  lease_ownership: 'lease_ownership',
  insurance: 'insurance',
  compliance: 'compliance',
  misc: 'miscellaneous',
  miscellaneous: 'miscellaneous',
}

export interface ParsedQueryIntent {
  cleanedQuery: string
  aircraftId?: string
  aircraftTail?: string
  docTypeFilter?: DocType[]
  adReferences: string[]
  sbReferences: string[]
  partNumbers: string[]
  ataChapters: string[]
  beforeDate?: string
  afterDate?: string
}

function mapDocTypeToken(token: string): DocType | null {
  return DOC_TYPE_ALIASES[token.trim().toLowerCase().replace(/[^\w]+/g, '_')] ?? null
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function uniqueDocTypes(values: Array<DocType | undefined | null>): DocType[] {
  return Array.from(new Set(values.filter((value): value is DocType => Boolean(value))))
}

function stripStructuredTerms(queryText: string) {
  const tails: string[] = []
  const docTypes: DocType[] = []
  const adReferences: string[] = []
  const sbReferences: string[] = []
  const partNumbers: string[] = []
  const ataChapters: string[] = []
  let afterDate: string | undefined
  let beforeDate: string | undefined

  let stripped = queryText

  stripped = stripped.replace(/(^|\s)@([A-Z0-9-]{1,10})(?=\s|$)/gi, (_, prefix, value) => {
    const normalized = normalizeTailNumber(value)
    if (normalized) tails.push(normalized.normalized)
    return prefix
  })

  stripped = stripped.replace(/(^|\s)tail:([A-Z0-9-]{1,10})(?=\s|$)/gi, (_, prefix, value) => {
    const normalized = normalizeTailNumber(value)
    if (normalized) tails.push(normalized.normalized)
    return prefix
  })

  stripped = stripped.replace(/(^|\s)(?:doc|type):([A-Z0-9_,-]+)(?=\s|$)/gi, (_, prefix, value) => {
    for (const token of String(value).split(/[,_]/)) {
      const mapped = mapDocTypeToken(token)
      if (mapped) docTypes.push(mapped)
    }
    return prefix
  })

  stripped = stripped.replace(/(^|\s)ad:([A-Z0-9-]+)(?=\s|$)/gi, (_, prefix, value) => {
    adReferences.push(String(value).toUpperCase())
    return prefix
  })

  stripped = stripped.replace(/(^|\s)sb:([A-Z0-9-]+)(?=\s|$)/gi, (_, prefix, value) => {
    sbReferences.push(String(value).toUpperCase())
    return prefix
  })

  stripped = stripped.replace(/(^|\s)pn:([A-Z0-9-]+)(?=\s|$)/gi, (_, prefix, value) => {
    partNumbers.push(String(value).toUpperCase())
    return prefix
  })

  stripped = stripped.replace(/(^|\s)ata:([A-Z0-9-]+)(?=\s|$)/gi, (_, prefix, value) => {
    ataChapters.push(String(value).toUpperCase())
    return prefix
  })

  stripped = stripped.replace(/(^|\s)after:(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?=\s|$)/gi, (_, prefix, value) => {
    afterDate = String(value)
    return prefix
  })

  stripped = stripped.replace(/(^|\s)before:(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?=\s|$)/gi, (_, prefix, value) => {
    beforeDate = String(value)
    return prefix
  })

  return {
    stripped,
    aircraftTail: uniqueStrings(tails)[0],
    docTypeFilter: uniqueDocTypes(docTypes),
    adReferences: uniqueStrings(adReferences),
    sbReferences: uniqueStrings(sbReferences),
    partNumbers: uniqueStrings(partNumbers),
    ataChapters: uniqueStrings(ataChapters),
    afterDate,
    beforeDate,
  }
}

// ─── Aggregation-query detection ────────────────────────────────────────────
//
// "How many times…", "list every…", "total hours…", "last time…", "first
// time…" style questions need a different retrieval + answer strategy than a
// point lookup: pull more chunks and run a structured event-extraction pass so
// the model can count/enumerate exhaustively rather than guess from 8 chunks.

export type AggregationType = 'count' | 'list' | 'sum' | 'first' | 'last'

/**
 * Classify whether `question` is an aggregation query (count / list / sum /
 * first / last). Case-insensitive. When several patterns match, the more
 * specific intent wins: count/list/sum outrank first/last.
 */
export function detectAggregationQuery(question: string): {
  isAggregation: boolean
  aggregationType: AggregationType | null
} {
  const q = question.toLowerCase()

  const isCount =
    /how many times/.test(q) ||
    /how often/.test(q) ||
    /number of times/.test(q) ||
    /how frequently/.test(q) ||
    /total number of/.test(q) ||
    /\bcount\b/.test(q)

  const isList =
    /list all/.test(q) ||
    /every time/.test(q) ||
    /all occurrences/.test(q) ||
    /full history/.test(q) ||
    /complete list/.test(q) ||
    /all entries/.test(q)

  const isSum =
    /total hours/.test(q) ||
    /total time/.test(q) ||
    /\bcumulative\b/.test(q)

  const isLast =
    /last time/.test(q) ||
    /most recent/.test(q) ||
    /\blatest\b/.test(q) ||
    /when was the last/.test(q)

  const isFirst = /first time/.test(q) || /when was the first/.test(q)

  // Specific intents (count/list/sum) win over first/last when both match.
  if (isCount) return { isAggregation: true, aggregationType: 'count' }
  if (isList) return { isAggregation: true, aggregationType: 'list' }
  if (isSum) return { isAggregation: true, aggregationType: 'sum' }
  if (isLast) return { isAggregation: true, aggregationType: 'last' }
  if (isFirst) return { isAggregation: true, aggregationType: 'first' }

  return { isAggregation: false, aggregationType: null }
}

// ─── Doc-type inference (pre-filtering) ─────────────────────────────────────
//
// Maps the *topic* of a question to the document types most likely to hold
// the answer, so retrieval can pre-filter and avoid drowning the answer in
// irrelevant doc types. Returns `null` for general questions (search all).
// Every value below is a REAL DocType — non-existent values like
// `aircraft_annual` would filter to zero rows.

interface DocTypeRule {
  pattern: RegExp
  docTypes: DocType[]
}

const DOC_TYPE_INFERENCE_RULES: DocTypeRule[] = [
  // Inspection / annual.
  {
    pattern:
      /\b(annual|100[\s-]?hour|100hr|biennial|bfr|flight review|inspection|returned to service)\b/i,
    docTypes: ['logbook', 'inspection_report', 'compliance'],
  },
  // Airworthiness directives.
  {
    pattern: /\b(ad|airworthiness directive|compliance)\b/i,
    docTypes: ['airworthiness_directive', 'stc', 'form_337', 'compliance'],
  },
  // Engine / propeller.
  {
    pattern:
      /\b(engine|prop|propeller|overhaul|smoh|spoh|tbo|compression|mag check|oil change)\b/i,
    docTypes: ['logbook', 'inspection_report'],
  },
  // Avionics / equipment.
  {
    pattern:
      /\b(avionics|transponder|ads-?b|gps|radio|altimeter|pitot|vor check|ifr)\b/i,
    docTypes: ['logbook', 'stc', 'inspection_report'],
  },
  // Damage / accident.
  {
    pattern:
      /\b(damage|accident|incident|prop strike|gear collapse|hard landing|repair|337)\b/i,
    docTypes: ['form_337', 'logbook', 'inspection_report'],
  },
  // Ownership / registration.
  {
    pattern: /\b(registration|owner|title|bill of sale|transfer|n-?number)\b/i,
    docTypes: ['lease_ownership'],
  },
  // Weight & balance.
  {
    pattern: /\b(weight|balance|w&b|cg|empty weight)\b/i,
    docTypes: ['stc', 'form_337'],
  },
]

/**
 * Infer the relevant DocType filter for a question. Returns `null` when no
 * category matches (search all doc types). When several categories match,
 * the union of their doc-type arrays is returned (deduplicated).
 */
export function inferRelevantDocTypes(question: string): string[] | null {
  const matched = new Set<DocType>()

  for (const rule of DOC_TYPE_INFERENCE_RULES) {
    if (rule.pattern.test(question)) {
      for (const docType of rule.docTypes) matched.add(docType)
    }
  }

  return matched.size > 0 ? Array.from(matched) : null
}

export async function parseStructuredQuery(params: {
  organizationId: string
  aircraftId?: string
  docTypeFilter?: DocType[]
  queryText: string
}): Promise<ParsedQueryIntent> {
  const extracted = stripStructuredTerms(params.queryText)
  const cleanedQuery = extracted.stripped.replace(/\s+/g, ' ').trim() || params.queryText.trim()

  let aircraftId = params.aircraftId
  if (!aircraftId && extracted.aircraftTail) {
    const service = createServiceSupabase()
    const { data } = await service
      .from('aircraft')
      .select('id, tail_number')
      .eq('organization_id', params.organizationId)
      .eq('tail_number', extracted.aircraftTail)
      .maybeSingle()

    aircraftId = data?.id
  }

  const docTypeFilter = uniqueDocTypes([
    ...(params.docTypeFilter ?? []),
    ...(extracted.docTypeFilter ?? []),
  ])

  return {
    cleanedQuery,
    aircraftId,
    aircraftTail: extracted.aircraftTail,
    docTypeFilter: docTypeFilter.length > 0 ? docTypeFilter : undefined,
    adReferences: extracted.adReferences,
    sbReferences: extracted.sbReferences,
    partNumbers: extracted.partNumbers,
    ataChapters: extracted.ataChapters,
    afterDate: extracted.afterDate,
    beforeDate: extracted.beforeDate,
  }
}
