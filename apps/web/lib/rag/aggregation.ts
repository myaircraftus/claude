/**
 * Multi-step retrieval for aggregation queries ("how many times…", "list
 * every…", "last time…", etc.) in the Ask Logbook AI RAG path.
 *
 * A point-lookup answer drawn from 8 chunks cannot reliably COUNT or ENUMERATE
 * — the model has to guess from a partial view. For aggregation queries we
 * retrieve a wider set of chunks and run a dedicated structured extraction
 * pass: a small LLM pulls every discrete maintenance event out of the chunk
 * text as JSON, we deduplicate near-identical events, and the answer is then
 * grounded in that exhaustive event list rather than free-form synthesis.
 *
 * This module is best-effort: `extractAggregationEvents` throws on a hard LLM
 * failure so the caller can fall back to the normal answer path.
 */
import OpenAI from 'openai'
import type { RetrievedChunk } from '@/types'

/** One discrete maintenance event extracted from the logbook excerpts. */
export interface AggregationEvent {
  date: string | null
  description: string
  part_number: string | null
  mechanic: string | null
  source_chunk_id: string | null
}

// ─── Normalized similarity for dedup ────────────────────────────────────────

/** Lowercase, strip non-alphanumerics, collapse whitespace. */
function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Token-set Jaccard similarity of two strings in [0,1]. */
function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeForCompare(a).split(' ').filter(Boolean))
  const tb = new Set(normalizeForCompare(b).split(' ').filter(Boolean))
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0
  let intersection = 0
  for (const token of ta) if (tb.has(token)) intersection += 1
  const union = ta.size + tb.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Drop events whose (date + description) is >85% similar to an already-kept
 * event. Plain normalized token-Jaccard — no ML. Keeps the first occurrence.
 */
export function dedupeAggregationEvents(events: AggregationEvent[]): AggregationEvent[] {
  const kept: AggregationEvent[] = []
  for (const event of events) {
    const signature = `${event.date ?? ''} ${event.description}`
    const isDuplicate = kept.some((existing) => {
      const existingSignature = `${existing.date ?? ''} ${existing.description}`
      return jaccardSimilarity(signature, existingSignature) > 0.85
    })
    if (!isDuplicate) kept.push(event)
  }
  return kept
}

/** Coerce an unknown JSON value to a trimmed string or null. */
function asStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Run the structured extraction pass over `chunks` for an aggregation query.
 * Returns the deduplicated list of discrete maintenance events. Each event's
 * `source_chunk_id`, when set, points at the chunk that contained it so
 * citations resolve downstream.
 *
 * Throws on a hard LLM failure (missing key, network, unparseable response)
 * so the caller can fall back to the normal generateAnswer path.
 */
export async function extractAggregationEvents(
  question: string,
  chunks: RetrievedChunk[],
): Promise<AggregationEvent[]> {
  if (chunks.length === 0) return []

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('extractAggregationEvents: OPENAI_API_KEY not configured')
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30000,
    maxRetries: 1,
  })

  // Label each chunk with its id so the model can fill source_chunk_id.
  const validChunkIds = new Set(chunks.map((c) => c.chunk_id))
  const excerpts = chunks
    .map(
      (c) =>
        `--- chunk_id: ${c.chunk_id} ---\n${(c.chunk_text ?? '').slice(0, 4000)}`,
    )
    .join('\n\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Extract all discrete maintenance events from these logbook ' +
          'excerpts relevant to the user question. Return ONLY a JSON object ' +
          '{"events":[{date, description, part_number, mechanic, ' +
          'source_chunk_id}]}. Include EVERY event even if similar; do not ' +
          'summarize or combine. If none, return {"events":[]}. The ' +
          'source_chunk_id MUST be one of the chunk_id labels provided.',
      },
      {
        role: 'user',
        content: `QUESTION: ${question}\n\nLOGBOOK EXCERPTS:\n${excerpts}`,
      },
    ],
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw) as { events?: unknown }
  const rawEvents = Array.isArray(parsed.events) ? parsed.events : []

  const events: AggregationEvent[] = rawEvents
    .map((entry): AggregationEvent | null => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const description = asStringOrNull(e.description)
      if (!description) return null
      const sourceChunkId = asStringOrNull(e.source_chunk_id)
      return {
        date: asStringOrNull(e.date),
        description,
        part_number: asStringOrNull(e.part_number),
        mechanic: asStringOrNull(e.mechanic),
        source_chunk_id:
          sourceChunkId && validChunkIds.has(sourceChunkId) ? sourceChunkId : null,
      }
    })
    .filter((e): e is AggregationEvent => e != null)

  return dedupeAggregationEvents(events)
}

/** Parse a freeform event date string into a sortable key (epoch ms). */
function eventDateSortKey(date: string | null): number {
  if (!date) return Number.NaN
  // M/D/YYYY or MM/DD/YYYY
  const slash = date.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (slash) {
    const t = new Date(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])).getTime()
    if (!Number.isNaN(t)) return t
  }
  // YYYY-MM-DD
  const dash = date.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (dash) {
    const t = new Date(Number(dash[1]), Number(dash[2]) - 1, Number(dash[3])).getTime()
    if (!Number.isNaN(t)) return t
  }
  const generic = new Date(date).getTime()
  return Number.isNaN(generic) ? Number.NaN : generic
}

/**
 * Sort events ascending by date and return the single one at the requested
 * end: `first` → earliest, `last` → most recent. Events with no parseable
 * date sink to the start of the ascending list. Returns null if `events` is
 * empty.
 */
export function pickFirstOrLastEvent(
  events: AggregationEvent[],
  which: 'first' | 'last',
): AggregationEvent | null {
  if (events.length === 0) return null
  const sorted = [...events].sort((a, b) => {
    const ka = eventDateSortKey(a.date)
    const kb = eventDateSortKey(b.date)
    const sa = Number.isNaN(ka) ? -Infinity : ka
    const sb = Number.isNaN(kb) ? -Infinity : kb
    return sa - sb
  })
  return which === 'first' ? sorted[0] : sorted[sorted.length - 1]
}

/**
 * Render the deduplicated event list into a context block the answer model
 * grounds its count/list on. Each line carries the source_chunk_id so the
 * model can cite it.
 */
export function formatAggregationContext(
  question: string,
  aggregationType: 'count' | 'list' | 'sum' | 'first' | 'last',
  events: AggregationEvent[],
): string {
  const lines: string[] = []
  lines.push(`AGGREGATION QUERY TYPE: ${aggregationType}`)
  lines.push(`QUESTION: ${question}`)
  lines.push(`EXTRACTED EVENT COUNT: ${events.length}`)
  lines.push('')
  lines.push('STRUCTURED MAINTENANCE EVENTS (each is a distinct, deduplicated event):')
  events.forEach((event, index) => {
    const parts = [
      `Date: ${event.date ?? 'unknown'}`,
      `Description: ${event.description}`,
      event.part_number ? `Part: ${event.part_number}` : null,
      event.mechanic ? `Mechanic: ${event.mechanic}` : null,
      event.source_chunk_id ? `source_chunk_id: ${event.source_chunk_id}` : null,
    ].filter(Boolean)
    lines.push(`Event ${index + 1}: ${parts.join(' | ')}`)
  })
  return lines.join('\n')
}
