import { createServiceSupabase } from '@/lib/supabase/server'
import type { RetrievedChunk, DocType } from '@/types'
import { parseStructuredQuery, type ParsedQueryIntent } from './query-parser'

function mapRpcRow(row: Record<string, unknown>): RetrievedChunk {
  return {
    chunk_id: row.chunk_id as string,
    document_id: row.document_id as string,
    document_title: row.document_title as string,
    doc_type: row.doc_type as DocType,
    aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
    aircraft_tail: (row.tail_number as string | undefined) ?? undefined,
    page_number: row.page_number as number,
    page_number_end: (row.page_number_end as number | undefined) ?? undefined,
    section_title: (row.section_title as string | undefined) ?? undefined,
    chunk_text: row.chunk_text as string,
    metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
    vector_score: Number(row.vector_score ?? 0),
    keyword_score: Number(row.keyword_score ?? 0),
    combined_score: Number(row.combined_score ?? 0),
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

  const tokens = Array.from(
    new Set(
      queryText
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .filter((token) => token.length >= 3)
    )
  )

  if (tokens.length === 0) return 0

  let matches = 0
  for (const token of tokens) {
    if (haystack.includes(token)) matches += 1
  }

  return matches / tokens.length
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

  if (chunks.length === 0) {
    chunks = await runKeywordFallback({
      organizationId: params.organizationId,
      aircraftId: effectiveAircraftId,
      queryText: effectiveQueryText,
      docTypeFilter: effectiveDocTypeFilter,
      limit,
    })
  }

  const filteredByDate = await applyDocumentDateFilters(chunks, parsedQuery)

  return filteredByDate
    .map((chunk) => {
      const boost = structuredScoreBoost(chunk, parsedQuery)
      return {
        ...chunk,
        keyword_score: Math.max(chunk.keyword_score, localKeywordScore(effectiveQueryText, chunk)),
        combined_score: chunk.combined_score + boost,
      }
    })
    .sort((a, b) => b.combined_score - a.combined_score)
    .slice(0, limit)
}
