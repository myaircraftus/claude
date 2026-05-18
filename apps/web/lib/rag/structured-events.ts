/**
 * Structured-event recall booster for aggregation queries.
 *
 * Aggregation answers (count / list / first / last / sum) extract events from
 * the chunks that retrieval surfaced — and retrieval page-recall@20 is ~31%,
 * so a "how many annuals" count drawn from retrieved chunks alone
 * systematically undercounts: the event is real but its chunk was never in
 * the top results.
 *
 * `maintenance_events` is the structured projection of every approved, dated
 * OCR-extracted maintenance event (~2.3K rows, fed by the
 * promote_approved_event_to_logbook trigger). This module pulls those rows
 * directly — scoped to the org/aircraft, bounded to a plausible date window,
 * narrowed by any explicit AD/SB/ATA/date signals in the query — and renders
 * each as a synthetic RetrievedChunk so the existing aggregation extraction
 * pass (lib/rag/aggregation.ts) sees them alongside the retrieved chunks.
 *
 * Why a chunk and not a direct SQL count: `event_type` is unnormalized
 * free text (117 distinct values, generic catch-all buckets), so a SQL
 * `count(... WHERE event_type ILIKE '%annual%')` would undercount. Feeding
 * the rows through the LLM extraction pass lets it judge topic relevance
 * from the clean `description`, so the messy column is never trusted.
 *
 * Each synthetic chunk is keyed `mev:<event id>` and carries the event's real
 * document_id + page_number, so its citation opens the correct PDF page. The
 * citations.chunk_id FK to document_chunks was dropped, so chunk_id is just a
 * soft pointer — no per-event document_chunks lookup is needed. Best-effort:
 * any failure returns [] and the caller falls back to the retrieved chunks.
 */
import OpenAI from 'openai'
import type { AggregationType, ParsedQueryIntent } from '@/lib/rag/query-parser'
import type { createServiceSupabase } from '@/lib/supabase/server'
import type { DocType, RetrievedChunk } from '@/types'

type ServiceClient = ReturnType<typeof createServiceSupabase>

/** OCR misreads handwritten dates into impossible years — clamp to a sane window. */
const PLAUSIBLE_MIN_DATE = '1955-01-01'
/** Most-recent N events (last / sum) — the LLM extraction pass filters by topic. */
const DEFAULT_LIMIT = 80
/** count / list pull a wider set for the exemplar list; the count itself is SQL. */
const COMPLETENESS_LIMIT = 100

interface MaintenanceEventRow {
  id: string
  document_id: string | null
  source_page: number | null
  event_date: string | null
  event_type: string | null
  description: string | null
  mechanic_name: string | null
  tach_time: number | null
  airframe_tt: number | null
  ad_reference: string | null
  sb_reference: string | null
  ata_chapter: string | null
  part_numbers: unknown
}

/** PostgREST `.or()` filter values are raw — only allow plainly safe tokens. */
function isSafeFilterToken(value: string): boolean {
  return /^[A-Za-z0-9 ._/-]+$/.test(value)
}

/** Render a jsonb part-numbers value to a short human string, or '' if none. */
function partNumbersToString(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const tokens = value
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>
        const candidate = record.part_number ?? record.pn ?? record.number
        return typeof candidate === 'string' ? candidate : null
      }
      return null
    })
    .filter((token): token is string => Boolean(token && token.trim()))
  return tokens.slice(0, 6).join(', ')
}

/** Clean one-line rendering of a maintenance_events row for LLM extraction. */
function renderEventChunkText(row: MaintenanceEventRow): string {
  const parts: string[] = []
  parts.push(`Maintenance record${row.event_date ? ` dated ${row.event_date}` : ''}.`)
  if (row.event_type) parts.push(`Type: ${row.event_type}.`)
  if (row.description) parts.push(row.description)

  const meta: string[] = []
  if (row.tach_time != null) meta.push(`Tach ${row.tach_time}`)
  if (row.airframe_tt != null) meta.push(`Airframe TT ${row.airframe_tt}`)
  if (row.ad_reference) meta.push(`AD ${row.ad_reference}`)
  if (row.sb_reference) meta.push(`SB ${row.sb_reference}`)
  if (row.ata_chapter) meta.push(`ATA ${row.ata_chapter}`)
  if (row.mechanic_name) meta.push(`Mechanic: ${row.mechanic_name}`)
  const partNumbers = partNumbersToString(row.part_numbers)
  if (partNumbers) meta.push(`Parts: ${partNumbers}`)
  if (meta.length > 0) parts.push(`(${meta.join('; ')})`)

  return parts.join(' ')
}

/**
 * Pull the org/aircraft's structured maintenance events as synthetic
 * RetrievedChunks for the aggregation extraction pass. Best-effort — returns
 * [] on any failure so the caller keeps the retrieved-chunk-only behavior.
 */
export async function fetchStructuredEventChunks(args: {
  supabase: ServiceClient
  organizationId: string
  aircraftId?: string | null
  parsedQuery: ParsedQueryIntent
  aggregationType?: AggregationType
  limit?: number
}): Promise<RetrievedChunk[]> {
  const { supabase, organizationId, aircraftId, parsedQuery, aggregationType } = args
  // count/list need a near-complete view; first needs the EARLIEST events, not
  // the most recent; last/sum are fine with a recent window.
  const wantsCompleteness = aggregationType === 'count' || aggregationType === 'list'
  const limit = args.limit ?? (wantsCompleteness ? COMPLETENESS_LIMIT : DEFAULT_LIMIT)
  const ascending = aggregationType === 'first'

  try {
    const today = new Date().toISOString().slice(0, 10)

    let query = supabase
      .from('maintenance_events')
      .select(
        'id, document_id, source_page, event_date, event_type, description, ' +
          'mechanic_name, tach_time, airframe_tt, ad_reference, sb_reference, ' +
          'ata_chapter, part_numbers',
      )
      .eq('organization_id', organizationId)
      // Drop OCR-garbage and undated rows: an undated event cannot anchor a
      // first/last answer, and impossible years would corrupt date sorting.
      .gte('event_date', PLAUSIBLE_MIN_DATE)
      .lte('event_date', today)

    if (aircraftId) query = query.eq('aircraft_id', aircraftId)
    if (parsedQuery.afterDate) query = query.gte('event_date', parsedQuery.afterDate)
    if (parsedQuery.beforeDate) query = query.lte('event_date', parsedQuery.beforeDate)

    // Explicit AD / SB / ATA signals narrow the pull (OR across the columns).
    // Rare in practice — only fires on ad:/sb:/ata: query tokens.
    const orParts: string[] = []
    for (const ref of parsedQuery.adReferences ?? []) {
      if (isSafeFilterToken(ref)) orParts.push(`ad_reference.ilike.%${ref}%`)
    }
    for (const ref of parsedQuery.sbReferences ?? []) {
      if (isSafeFilterToken(ref)) orParts.push(`sb_reference.ilike.%${ref}%`)
    }
    for (const chapter of parsedQuery.ataChapters ?? []) {
      if (isSafeFilterToken(chapter)) orParts.push(`ata_chapter.ilike.%${chapter}%`)
    }
    if (orParts.length > 0) query = query.or(orParts.join(','))

    query = query.order('event_date', { ascending }).limit(limit)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const rows = ((data ?? []) as MaintenanceEventRow[]).filter(
      (row): row is MaintenanceEventRow & { document_id: string; source_page: number } =>
        Boolean(row.document_id) && typeof row.source_page === 'number',
    )
    if (rows.length === 0) return []

    // Each structured event becomes a synthetic chunk keyed `mev:<id>`. The
    // citation carries the event's REAL document_id + page_number (so it opens
    // the right PDF page); chunk_id is only a soft pointer now — the
    // citations.chunk_id FK to document_chunks was dropped, so there is no need
    // to resolve every event to a document_chunks row. (That resolution also
    // hit the PostgREST 1000-row cap and silently dropped ~85% of events.)
    const documentIds = Array.from(new Set(rows.map((row) => row.document_id)))
    const { data: documentData } = await supabase
      .from('documents')
      .select('id, title, doc_type')
      .in('id', documentIds)

    const documentById = new Map<string, { title: string | null; doc_type: string | null }>()
    for (const doc of (documentData ?? []) as Array<{
      id: string
      title: string | null
      doc_type: string | null
    }>) {
      documentById.set(doc.id, { title: doc.title, doc_type: doc.doc_type })
    }

    return rows.map((row): RetrievedChunk => {
      const document = documentById.get(row.document_id)
      return {
        chunk_id: `mev:${row.id}`,
        document_id: row.document_id,
        document_title: document?.title ?? 'Maintenance record',
        doc_type: (document?.doc_type ?? 'logbook') as DocType,
        page_number: row.source_page,
        section_title: 'Maintenance record',
        chunk_text: renderEventChunkText(row),
        metadata_json: { source: 'maintenance_events', maintenance_event_id: row.id },
        vector_score: 0,
        keyword_score: 0,
        combined_score: 0,
      }
    })
  } catch (err) {
    console.error('[structured-events] fetch failed — returning []:', err)
    return []
  }
}

/**
 * Exact count of an aircraft's maintenance records on file — count(*) over
 * maintenance_events within the plausible date window. This is the trustworthy
 * denominator for "how many maintenance entries / records" questions, which
 * the chunk-extraction path systematically undercounts (it can only count what
 * retrieval surfaced). Returns null on any failure so the caller falls back.
 */
export async function countAircraftMaintenanceEvents(
  supabase: ServiceClient,
  organizationId: string,
  aircraftId: string,
): Promise<number | null> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { count, error } = await supabase
      .from('maintenance_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('aircraft_id', aircraftId)
      .gte('event_date', PLAUSIBLE_MIN_DATE)
      .lte('event_date', today)
    if (error) return null
    return count ?? null
  } catch {
    return null
  }
}

/** Result of classifying a "how many" question. */
export interface CountTopic {
  /** True when the user wants the total count of ALL maintenance entries. */
  isGrandTotal: boolean
  /** ILIKE fragments identifying a specific work type (oil, annual, …). */
  keywords: string[]
}

/**
 * Classify a count question: is it asking for the grand total of all
 * maintenance entries, or how many of a specific work type? For the latter,
 * return short keyword fragments to match event descriptions. One small
 * gpt-4o-mini call; falls back to {isGrandTotal:false, keywords:[]} on failure
 * (the caller then keeps the chunk-extraction estimate).
 */
export async function deriveCountTopic(question: string): Promise<CountTopic> {
  try {
    if (!process.env.OPENAI_API_KEY) return { isGrandTotal: false, keywords: [] }
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 12000,
      maxRetries: 1,
    })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'An aircraft owner asks a "how many / how often" maintenance ' +
            'question. Reply strict JSON {"is_grand_total":bool,"keywords":[...]}. ' +
            'is_grand_total is true ONLY when they want the total count of ALL ' +
            'maintenance entries/records with no specific work type. Otherwise ' +
            'keywords holds 1-3 short lowercase fragments to match event ' +
            'descriptions via SQL ILIKE — broad distinctive stems for the work ' +
            'type, e.g. ["oil"], ["annual"], ["spark plug"], ["magneto","mag"], ' +
            '["tire"]. Keep fragments short; prefer a stem over a full phrase.',
        },
        { role: 'user', content: question },
      ],
    })
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
      is_grand_total?: unknown
      keywords?: unknown
    }
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
          .map((k) => k.trim().toLowerCase())
          .slice(0, 3)
      : []
    return { isGrandTotal: parsed.is_grand_total === true, keywords }
  } catch {
    return { isGrandTotal: false, keywords: [] }
  }
}

/**
 * Exact-ish count of an aircraft's maintenance records matching a work-type
 * topic — count(*) over maintenance_events where the description or event_type
 * ILIKE-matches any keyword. The keyword match is fuzzy (the answer must say
 * "approximately"), but it counts EVERY record, not just retrieved chunks, so
 * it is far closer than the chunk-extraction estimate. Returns null on failure.
 */
export async function countEventsMatching(
  supabase: ServiceClient,
  organizationId: string,
  aircraftId: string,
  keywords: string[],
): Promise<number | null> {
  try {
    const safe = keywords.filter((k) => /^[A-Za-z0-9 ./-]+$/.test(k))
    if (safe.length === 0) return null
    const today = new Date().toISOString().slice(0, 10)
    const orFilter = safe
      .flatMap((k) => [`description.ilike.%${k}%`, `event_type.ilike.%${k}%`])
      .join(',')
    const { count, error } = await supabase
      .from('maintenance_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('aircraft_id', aircraftId)
      .gte('event_date', PLAUSIBLE_MIN_DATE)
      .lte('event_date', today)
      .or(orFilter)
    if (error) return null
    return count ?? null
  } catch {
    return null
  }
}
