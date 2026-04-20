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
