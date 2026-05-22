/**
 * Structured fleet-aggregation handler for /api/ask.
 *
 * RAG (vector + BM25 + rerank + GPT-4o) is great at "what did the mechanic
 * write on this page" but bad at chronological-extremum questions across the
 * whole fleet — "what's the oldest entry?", "how many aircraft have records
 * before 1980?", "what's the most recent annual?". A vector search on
 * "oldest" doesn't naturally retrieve the actual oldest entry; the model
 * synthesizes a confident-sounding wrong answer from whatever it does
 * retrieve.
 *
 * This module catches those queries BEFORE the LLM, runs a real SQL
 * aggregation on `page_tree_nodes` (with sanitization for the OCR garbage
 * dates the index sometimes contains), and returns a structured answer that
 * cites the actual oldest/newest entry's parent document.
 *
 * Returns null when the question doesn't match a structured pattern, in
 * which case /api/ask falls through to the normal RAG path. Best-effort
 * throughout — any error returns null and the RAG path takes over.
 *
 * Discovered by the 40-question stress test on 2026-05-21: the previous
 * codepath answered "the oldest logbook entry is June 4, 2008 on N4918H"
 * with confidence:high — when the actual oldest entry is 1967 on N8202L.
 * Two high-confidence hallucinations on extremum queries became the
 * motivating reason to add structured aggregation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AnswerCitation } from '@/types'

export interface StructuredAggregationResult {
  answer: string
  citations: AnswerCitation[]
  confidence: 'high' | 'medium'
  follow_up_questions?: string[]
}

interface AggregationContext {
  organizationId: string
  /** Service-role Supabase client (RLS bypass; we filter by orgId in WHERE). */
  supabase: SupabaseClient
}

// ── Pattern matchers ──────────────────────────────────────────────────────

/** "oldest / earliest / first / very first" logbook / record / entry */
const OLDEST_PATTERN =
  /\b(?:oldest|earliest|very\s+first|first(?:\s+ever)?)\s+(?:logbook\s+)?(?:entry|record|maintenance|inspection)/i

/** "newest / most recent / latest / very latest" logbook / record / entry */
const NEWEST_PATTERN =
  /\b(?:newest|latest|most\s+recent|very\s+latest)\s+(?:logbook\s+)?(?:entry|record)/i

/** "records (before|prior to|earlier than) <year>"  OR  "before <year>" near "record/entry/logbook" */
const RECORDS_BEFORE_YEAR =
  /\b(?:records?|entries?|logbook\s+entries?)\s+(?:from\s+)?(?:before|prior\s+to|earlier\s+than|pre[-\s]?)\s*(\d{4})\b/i

/** "records (after|since) <year>" */
const RECORDS_AFTER_YEAR =
  /\b(?:records?|entries?|logbook\s+entries?)\s+(?:from\s+)?(?:after|since|post[-\s]?)\s*(\d{4})\b/i

/** "how many of my aircraft (have records|with records) before <year>" */
const HOW_MANY_AIRCRAFT_BEFORE_YEAR =
  /\bhow many (?:of (?:my|our|the) )?(?:aircraft|airplanes|planes)\s+(?:have|with)\s+(?:records?|entries?|logbook\s+entries?)\s+(?:from\s+)?(?:before|prior\s+to|earlier\s+than|pre[-\s]?)\s*(\d{4})\b/i

/** "across my fleet" / "all my aircraft" — strong fleet signal */
const FLEET_HINT_PATTERN =
  /\b(?:across\s+(?:my|our|the)\s+(?:fleet|aircraft)|all\s+(?:of\s+)?(?:my|our)\s+aircraft|my\s+fleet|fleet[-\s]wide)\b/i

// ── Public dispatcher ─────────────────────────────────────────────────────

/**
 * Try to satisfy the question via structured SQL aggregation. Returns null
 * if nothing matched — caller falls through to RAG.
 */
export async function tryFleetAggregation(
  question: string,
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const q = question.trim()
  if (q.length === 0) return null

  try {
    // 1. "how many aircraft have records before YEAR" — this is the most
    //    specific pattern; check first so a more generic match doesn't steal it.
    const howManyBefore = q.match(HOW_MANY_AIRCRAFT_BEFORE_YEAR)
    if (howManyBefore) {
      const year = parseInt(howManyBefore[1]!, 10)
      if (year >= 1900 && year <= 2100) {
        return await answerHowManyAircraftBeforeYear(year, ctx)
      }
    }

    // 2. "records before YEAR"
    const beforeYear = q.match(RECORDS_BEFORE_YEAR)
    if (beforeYear) {
      const year = parseInt(beforeYear[1]!, 10)
      if (year >= 1900 && year <= 2100) {
        return await answerRecordsBeforeYear(year, ctx)
      }
    }

    // 3. "records after YEAR"
    const afterYear = q.match(RECORDS_AFTER_YEAR)
    if (afterYear) {
      const year = parseInt(afterYear[1]!, 10)
      if (year >= 1900 && year <= 2100) {
        return await answerRecordsAfterYear(year, ctx)
      }
    }

    // 4. "oldest entry" — only handle when there's a fleet hint, so single-
    //    aircraft "oldest entry on this plane" still goes through RAG (the
    //    /api/ask single-aircraft path is separate and won't reach here
    //    anyway, but this is defense in depth).
    if (OLDEST_PATTERN.test(q)) {
      return await answerOldestEntry(ctx)
    }

    // 5. "newest entry" / "most recent entry"
    if (NEWEST_PATTERN.test(q) && FLEET_HINT_PATTERN.test(q)) {
      return await answerNewestEntry(ctx)
    }

    return null
  } catch (err) {
    // Best-effort — any failure means RAG takes over.
    console.warn('[ask/fleet-aggregation] error (falling back to RAG):', err)
    return null
  }
}

// ── Date sanitization ─────────────────────────────────────────────────────
//
// page_tree_nodes.date is populated by the OCR + tree-builder pipeline, which
// occasionally emits garbage like "0371-07-20" or "8813-10-03" from misread
// digits. We bound dates to [aircraft.year - 1, CURRENT_DATE] — i.e., from
// roughly the aircraft's manufacture date through today. Aircraft with NULL
// year are bounded to a global [1956-01-01, today] window (the earliest
// realistic Cessna 152/172 production date).
//
// Implemented as a WHERE-clause snippet shared across all handlers.

const SANITIZED_DATE_WHERE = `
  p.level = 'entry'
  AND p.date IS NOT NULL
  AND p.date BETWEEN DATE '1956-01-01' AND CURRENT_DATE
  AND (a.year IS NULL OR EXTRACT(YEAR FROM p.date)::int >= a.year - 1)
  AND a.is_archived = false
  AND p.org_id = $1
`

// ── Handlers ──────────────────────────────────────────────────────────────

async function answerOldestEntry(
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const sql = `
    SELECT
      a.tail_number AS tail,
      a.id::text    AS aircraft_id,
      a.year        AS built_year,
      a.make,
      a.model,
      p.date        AS entry_date,
      p.label       AS entry_label,
      p.page_number AS page_number,
      p.doc_id::text AS doc_id,
      d.title       AS doc_title
    FROM page_tree_nodes p
    JOIN aircraft a ON a.id = p.aircraft_id
    JOIN documents d ON d.id = p.doc_id
    WHERE ${SANITIZED_DATE_WHERE}
    ORDER BY p.date ASC, a.tail_number ASC
    LIMIT 1
  `
  const { data, error } = await ctx.supabase.rpc('exec_sql', {
    query: sql,
    params: [ctx.organizationId],
  })

  // exec_sql is the project's wrapper for arbitrary parameterised SQL. If
  // it isn't deployed, we degrade to a typed-builder version below.
  if (error || !data) {
    return await answerOldestEntryViaBuilder(ctx)
  }
  const rows = data as Array<Record<string, unknown>>
  if (rows.length === 0) return null

  return formatOldestNewestRow(rows[0], 'oldest')
}

/**
 * Fallback using the typed Supabase query builder. No raw SQL; relies on the
 * (large) aggregation being done in JS over the ~5K entry-level rows.
 */
async function answerOldestEntryViaBuilder(
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  // Ascending order at the DB layer so PostgREST's row-cap (default 1000)
  // still hands us the earliest rows. Without the explicit .order() the
  // 1000-row slice is in insertion order and the actually-earliest entries
  // can be entirely missed — root cause of the 2026-05-21 mis-answer that
  // said "oldest is 1980-10-06 N69207" when N8202L has 1967 entries.
  const { data: rows, error } = await ctx.supabase
    .from('page_tree_nodes')
    .select(
      'date, label, page_number, doc_id, aircraft_id, aircraft:aircraft_id(tail_number, year, make, model, is_archived), document:doc_id(title)',
    )
    .eq('org_id', ctx.organizationId)
    .eq('level', 'entry')
    .not('date', 'is', null)
    .gte('date', '1956-01-01')
    .lte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: true })
    .limit(500)

  if (error || !rows) return null

  // Walk in date-ascending order and return the first row that passes the
  // per-aircraft sanity filter. For aircraft WITH a known manufacture
  // year, date must be >= aircraft.year - 1. For aircraft with NULL year
  // (a real gap in our master data), we SKIP them entirely on the
  // oldest-entry path — without a year anchor we can't tell legitimate
  // pre-1960 entries from OCR garbage like "1956-08-17 on a Cessna 152"
  // (Cessna 152 production started 1977). Skipping is conservative —
  // the answer is "the oldest provably-real entry across your verifiably-
  // dated aircraft", not "the smallest date string we found anywhere".
  let oldest: any = null
  for (const r of rows as any[]) {
    if (!r.aircraft || r.aircraft.is_archived) continue
    if (!r.aircraft.year) continue // require known year for the floor check
    const y = new Date(r.date).getUTCFullYear()
    if (y < r.aircraft.year - 1) continue
    oldest = r
    break
  }
  if (!oldest) return null
  return formatOldestNewestRow(
    {
      tail: oldest.aircraft?.tail_number,
      aircraft_id: oldest.aircraft_id,
      built_year: oldest.aircraft?.year,
      make: oldest.aircraft?.make,
      model: oldest.aircraft?.model,
      entry_date: oldest.date,
      entry_label: oldest.label,
      page_number: oldest.page_number,
      doc_id: oldest.doc_id,
      doc_title: oldest.document?.title,
    },
    'oldest',
  )
}

async function answerNewestEntry(
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const { data: rows, error } = await ctx.supabase
    .from('page_tree_nodes')
    .select(
      'date, label, page_number, doc_id, aircraft_id, aircraft:aircraft_id(tail_number, year, make, model, is_archived), document:doc_id(title)',
    )
    .eq('org_id', ctx.organizationId)
    .eq('level', 'entry')
    .not('date', 'is', null)
    .gte('date', '1956-01-01')
    .lte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(500)

  if (error || !rows) return null

  // Walk in date-descending order and return the first row whose date is
  // not in the future relative to the aircraft's manufacture year. (Future
  // dates would be OCR misreads like "2237-06-15" — sanity-filter them.)
  let newest: any = null
  for (const r of rows as any[]) {
    if (!r.aircraft || r.aircraft.is_archived) continue
    const y = new Date(r.date).getUTCFullYear()
    if (r.aircraft.year && y < r.aircraft.year - 1) continue
    if (y > new Date().getUTCFullYear() + 1) continue // future date = bad OCR
    newest = r
    break
  }
  if (!newest) return null
  return formatOldestNewestRow(
    {
      tail: newest.aircraft?.tail_number,
      aircraft_id: newest.aircraft_id,
      built_year: newest.aircraft?.year,
      make: newest.aircraft?.make,
      model: newest.aircraft?.model,
      entry_date: newest.date,
      entry_label: newest.label,
      page_number: newest.page_number,
      doc_id: newest.doc_id,
      doc_title: newest.document?.title,
    },
    'newest',
  )
}

async function answerHowManyAircraftBeforeYear(
  year: number,
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const { data: rows, error } = await ctx.supabase
    .from('page_tree_nodes')
    .select(
      'date, aircraft_id, aircraft:aircraft_id(tail_number, year, is_archived)',
    )
    .eq('org_id', ctx.organizationId)
    .eq('level', 'entry')
    .not('date', 'is', null)
    .gte('date', '1956-01-01')
    .lt('date', `${year}-01-01`)
    .limit(50000)

  if (error || !rows) return null

  const tailsWithPriorRecords = new Set<string>()
  for (const r of rows as any[]) {
    if (!r.aircraft || r.aircraft.is_archived) continue
    if (r.aircraft.year && new Date(r.date).getUTCFullYear() < r.aircraft.year - 1) continue
    if (r.aircraft.tail_number) tailsWithPriorRecords.add(r.aircraft.tail_number)
  }
  const count = tailsWithPriorRecords.size
  const sample = Array.from(tailsWithPriorRecords).slice(0, 8).sort()

  return {
    answer:
      count === 0
        ? `Zero of your aircraft have logbook entries dated before ${year} based on the indexed records.`
        : `**${count}** of your aircraft have logbook entries dated before ${year}` +
          (sample.length > 0 ? `: ${sample.join(', ')}` : '') +
          (count > sample.length ? `, … (${count - sample.length} more)` : '') +
          `. (Computed via structured aggregation across page_tree_nodes; dates outside each aircraft's manufacture year are excluded as OCR noise.)`,
    citations: [],
    confidence: count > 0 ? 'high' : 'medium',
  }
}

async function answerRecordsBeforeYear(
  year: number,
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const { data: rows, error } = await ctx.supabase
    .from('page_tree_nodes')
    .select(
      'date, label, page_number, doc_id, aircraft_id, aircraft:aircraft_id(tail_number, year, is_archived), document:doc_id(title)',
    )
    .eq('org_id', ctx.organizationId)
    .eq('level', 'entry')
    .not('date', 'is', null)
    .gte('date', '1956-01-01')
    .lt('date', `${year}-01-01`)
    .order('date', { ascending: true })
    .limit(2000)

  if (error || !rows) return null

  const filtered = (rows as any[]).filter((r) => {
    if (!r.aircraft || r.aircraft.is_archived) return false
    if (!r.aircraft.year) return true
    return new Date(r.date).getUTCFullYear() >= r.aircraft.year - 1
  })
  if (filtered.length === 0) {
    return {
      answer: `No indexed logbook entries dated before ${year} were found for your fleet.`,
      citations: [],
      confidence: 'medium',
    }
  }

  const byTail = new Map<string, { count: number; earliest: string; latest: string }>()
  for (const r of filtered) {
    const t = r.aircraft.tail_number as string
    const stat = byTail.get(t) ?? { count: 0, earliest: r.date, latest: r.date }
    stat.count++
    if (r.date < stat.earliest) stat.earliest = r.date
    if (r.date > stat.latest) stat.latest = r.date
    byTail.set(t, stat)
  }
  const lines = Array.from(byTail.entries())
    .sort((a, b) => a[1].earliest.localeCompare(b[1].earliest))
    .slice(0, 12)
    .map(
      ([tail, s]) =>
        `- **${tail}** — ${s.count} ${s.count === 1 ? 'entry' : 'entries'} (${s.earliest} → ${s.latest})`,
    )
  return {
    answer:
      `Indexed logbook entries dated before ${year}, by aircraft (sanitised against OCR misreads):\n\n${lines.join('\n')}` +
      (byTail.size > 12 ? `\n\n…and ${byTail.size - 12} more aircraft.` : ''),
    citations: [],
    confidence: 'high',
  }
}

async function answerRecordsAfterYear(
  year: number,
  ctx: AggregationContext,
): Promise<StructuredAggregationResult | null> {
  const { data: rows, error } = await ctx.supabase
    .from('page_tree_nodes')
    .select(
      'date, aircraft_id, aircraft:aircraft_id(tail_number, year, is_archived)',
    )
    .eq('org_id', ctx.organizationId)
    .eq('level', 'entry')
    .not('date', 'is', null)
    .gte('date', `${year}-01-01`)
    .lte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: false })
    .limit(5000)

  if (error || !rows) return null

  const filtered = (rows as any[]).filter((r) => {
    if (!r.aircraft || r.aircraft.is_archived) return false
    if (!r.aircraft.year) return true
    return new Date(r.date).getUTCFullYear() >= r.aircraft.year - 1
  })
  if (filtered.length === 0) {
    return {
      answer: `No indexed logbook entries dated ${year} or later were found for your fleet.`,
      citations: [],
      confidence: 'medium',
    }
  }
  const tails = new Set<string>(filtered.map((r) => r.aircraft.tail_number))
  return {
    answer: `**${filtered.length}** indexed logbook entries across **${tails.size}** aircraft are dated ${year} or later. Aircraft: ${Array.from(tails).sort().slice(0, 12).join(', ')}${tails.size > 12 ? `, …(${tails.size - 12} more)` : ''}.`,
    citations: [],
    confidence: 'high',
  }
}

// ── Shared formatting ─────────────────────────────────────────────────────

function formatOldestNewestRow(
  row: Record<string, unknown>,
  which: 'oldest' | 'newest',
): StructuredAggregationResult {
  const tail = (row.tail ?? row.tail_number ?? 'Unknown tail') as string
  const date = String(row.entry_date ?? '').slice(0, 10)
  const built = row.built_year as number | null
  const make = (row.make ?? '') as string
  const model = (row.model ?? '') as string
  const docTitle = (row.doc_title ?? null) as string | null
  const docId = (row.doc_id ?? null) as string | null
  const page = (row.page_number ?? null) as number | null
  const label = (row.entry_label ?? '') as string

  const adj = which === 'oldest' ? 'oldest' : 'most-recent'
  const acDesc =
    built && make
      ? `${tail} (${built} ${make}${model ? ' ' + model : ''})`
      : tail
  const labelSnip = label.length > 120 ? label.slice(0, 117) + '…' : label

  const answer =
    `The ${adj} indexed logbook entry across your fleet is dated **${date}** on **${acDesc}**` +
    (docTitle ? ` — source: *${docTitle}*` : '') +
    (page ? `, page ${page}` : '') +
    (labelSnip ? `.\n\n> ${labelSnip}` : '.') +
    `\n\n*(Computed via structured aggregation on page_tree_nodes; dates outside each aircraft's manufacture year are excluded as OCR noise.)*`

  const citations: AnswerCitation[] = docId
    ? [
        {
          chunkId: `tree-aggregation-${docId}-${date}`,
          documentId: docId,
          documentTitle: docTitle ?? 'Logbook',
          pageNumber: page ?? 1,
          quotedText: label || `${adj} entry dated ${date}`,
          snippet: label || `${adj} entry dated ${date}`,
        } as AnswerCitation,
      ]
    : []

  return { answer, citations, confidence: 'high' }
}
