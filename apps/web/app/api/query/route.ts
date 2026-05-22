import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/request-user';
import { resolveRequestOrgContext } from '@/lib/auth/context';
import { generateEmbeddings } from '@/lib/openai/embeddings';
import { retrieveChunks } from '@/lib/rag/retrieval';
import { generateAnswer } from '@/lib/rag/generation';
import {
  parseStructuredQuery,
  detectAggregationQuery,
  inferRelevantDocTypes,
  type AggregationType,
} from '@/lib/rag/query-parser';
import {
  enrichAnswerCitationsWithAnchors,
  buildAnswerCitationFromChunk,
} from '@/lib/rag/citation-anchors';
import { searchBm25, searchReferenceBm25 } from '@/lib/rag/bm25-index';
import { logQueryResult } from '@/lib/rag/feedback';
import { routeQueryVerbose, type RouteDecision } from '@/lib/rag/query-router';
import { generateHypotheticalDocument } from '@/lib/rag/hyde';
import { rerankChunks } from '@/lib/rag/rerank';
import { hybridRetrieve as retrieveVisionPages } from '@/lib/vision/retriever';
import { embedVisionQuery } from '@/lib/vision/workers/modal';
import {
  extractAggregationEvents,
  formatAggregationContext,
  pickFirstOrLastEvent,
} from '@/lib/rag/aggregation';
import {
  fetchStructuredEventChunks,
  countAircraftMaintenanceEvents,
  countEventsMatching,
  deriveCountTopic,
  firstLastMaintenanceEvent,
  type MaintenanceEventRow,
} from '@/lib/rag/structured-events';
import type { DocType, RetrievedChunk } from '@/types';

// ─── Request schema ────────────────────────────────────────────────────────────

const DOC_TYPE_VALUES: [DocType, ...DocType[]] = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'stc',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
];

const conversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const queryRequestSchema = z.object({
  question: z.string().min(1).max(2000),
  aircraft_id: z.string().uuid().optional(),
  doc_type_filter: z.array(z.enum(DOC_TYPE_VALUES)).optional(),
  conversation_history: z.array(conversationTurnSchema).max(20).optional(),
  // Persona drives the HyDE prompt voice. Optional — defaults to 'owner'.
  persona: z.enum(['owner', 'mechanic', 'admin']).optional(),
});

// ─── PageIndex enhancement — additive BM25 + tree retrieval layer ───────────
//
// Layers BM25 keyword search and PageIndex hierarchical-tree retrieval ON TOP
// of the existing vector results. Never replaces them — every branch is
// best-effort and on any failure the original vector chunks pass straight
// through. The existing OCR → embedding → vector pipeline is untouched.

/** Pick chunk ids from PageIndex tree nodes whose label/summary match the query. */
async function selectTreeChunkIds(
  supabase: ReturnType<typeof createServiceSupabase>,
  aircraftId: string,
  question: string,
): Promise<Array<{ chunkId: string; sectionHint: string }>> {
  const { data: nodes } = await supabase
    .from('page_tree_nodes')
    .select('label, summary, level, chunk_ids')
    .eq('aircraft_id', aircraftId)
    .limit(2000)
  if (!nodes || nodes.length === 0) return []

  const terms = question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
  const ranked = (nodes as Array<Record<string, unknown>>)
    .map((node) => {
      const hay = `${node.label ?? ''} ${node.summary ?? ''}`.toLowerCase()
      let score = 0
      for (const term of terms) if (hay.includes(term)) score += 1
      return { node, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const out: Array<{ chunkId: string; sectionHint: string }> = []
  for (const { node } of ranked) {
    const ids = Array.isArray(node.chunk_ids) ? node.chunk_ids : []
    for (const id of ids) {
      if (typeof id === 'string') out.push({ chunkId: id, sectionHint: String(node.label ?? '') })
    }
  }
  return out
}

// ─── Vision retrieval — ColQwen2 page-image RAG (Wave 1.7c) ─────────────────
//
// Adds the vision index as a fourth, purely-ADDITIVE retriever. The Modal
// ColQwen2 query encoder embeds the question; the vision-only ANN + MaxSim
// retriever returns its best page matches; each page is mapped back to its
// text chunks and merged into the candidate pool with a bonus score. When
// vision is unconfigured or the GPU is unreachable this contributes nothing
// and the text pipeline is byte-identical to before.

/** Short timeout for the hot query path — a cold Modal GPU must never stall
 *  a text answer. Vision simply drops out for that one query if it's slow. */
const VISION_QUERY_TIMEOUT_MS = 8000

/** Additive bonus weight for a chunk whose page also matched the ColQwen2
 *  vision index. Tunable via VISION_BLEND_WEIGHT (0-1); default 0.25. */
function readVisionBlendWeight(): number {
  const env = process.env.VISION_BLEND_WEIGHT
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return 0.25
}

/**
 * Best-effort ColQwen2 vision retrieval, returned as text-chunk hits so the
 * caller can merge them straight into the hybrid candidate pool.
 *
 * Pipeline: embedVisionQuery (Modal query encoder) → vision-only ANN +
 * MaxSim retriever → map each (document, page) hit to its document_chunks
 * rows. Returns [] on ANY failure or when vision is unconfigured — never
 * throws, and never runs the retriever with stub query vectors.
 */
async function retrieveVisionChunkHits(args: {
  supabase: ReturnType<typeof createServiceSupabase>
  organizationId: string
  aircraftId?: string
  question: string
  limit: number
}): Promise<Array<{ chunk_id: string; score: number }>> {
  try {
    const embedded = await embedVisionQuery(args.question, {
      timeoutMs: VISION_QUERY_TIMEOUT_MS,
    })
    // No key/URL, cold GPU, timeout, or malformed response — skip vision.
    if (!embedded) return []

    const pages = await retrieveVisionPages(
      args.supabase,
      args.organizationId,
      args.question,
      {
        mode: 'vision',
        k: Math.max(args.limit, 8),
        candidateCap: 12,
        querySummaryVector: embedded.summaryVector,
        queryVectorTokens: embedded.tokenVectors,
      },
    )
    if (pages.length === 0) return []

    // Best vision score per (document_id, page_number).
    const scoreByKey = new Map<string, number>()
    for (const p of pages) {
      const key = `${p.source_document_id}:${p.page_number}`
      const prev = scoreByKey.get(key)
      if (prev === undefined || p.score_vision > prev) {
        scoreByKey.set(key, p.score_vision)
      }
    }

    // Map (document, page) → text chunk ids. A page may carry several
    // chunks; each inherits the page's vision score.
    const docIds = [...new Set(pages.map((p) => p.source_document_id))]
    const pageNums = [...new Set(pages.map((p) => p.page_number))]
    const { data: rows } = await args.supabase
      .from('document_chunks')
      .select('id, document_id, page_number, aircraft_id')
      .eq('organization_id', args.organizationId)
      .in('document_id', docIds)
      .in('page_number', pageNums)

    const hits: Array<{ chunk_id: string; score: number }> = []
    for (const row of (rows ?? []) as Array<{
      id: string
      document_id: string
      page_number: number
      aircraft_id: string | null
    }>) {
      // Aircraft scoping — when the query targets an aircraft, keep that
      // aircraft's chunks plus aircraft-less reference docs (mirrors the
      // reference-BM25 policy, Wave 1.3). Org-wide queries keep everything.
      if (args.aircraftId && row.aircraft_id && row.aircraft_id !== args.aircraftId) {
        continue
      }
      const score = scoreByKey.get(`${row.document_id}:${row.page_number}`)
      if (score === undefined) continue
      hits.push({ chunk_id: row.id, score })
    }
    return hits
  } catch (err) {
    console.error('[query] vision retrieval failed:', err)
    return []
  }
}

interface HybridRetrieval {
  chunks: RetrievedChunk[]
  /** Which retrievers returned ≥1 result. */
  strategiesUsed: string[]
  /** Per-retriever wall-clock latency (ms). */
  latencies: { vector: number; bm25: number; tree: number; vision: number }
  treeNodesUsed: number
}

/**
 * Hybrid retrieval — vector + BM25 + PageIndex tree run CONCURRENTLY
 * (Promise.all), merged + de-duplicated by chunk_id, then ranked by a weighted
 * blend: vector 0.45 + bm25 0.35 + tree 0.20. Returns the top `limit` chunks.
 *
 * Each retriever is independently try/caught — one failing (or no aircraft
 * scope) just contributes nothing; the others still rank. This is plain
 * Promise.all concurrency, not an agent framework. The caller wraps the whole
 * call in try/catch and falls back to vector-only on an unexpected failure.
 *
 * `docTypeFilter` is enforced two ways. The vector retriever (`retrieveChunks`)
 * filters at the SQL level. BM25 + tree carry no doc_type in their index
 * files, so they always RUN unfiltered and the doc-type filter is applied to
 * the MERGED, hydrated candidate set (every merged chunk has a `doc_type`)
 * before ranking. All three retrievers run regardless of the filter.
 */
async function hybridRetrieve(args: {
  supabase: ReturnType<typeof createServiceSupabase>
  organizationId: string
  aircraftId?: string
  queryEmbedding: number[]
  queryText: string
  question: string
  docTypeFilter?: DocType[] | null
  parsedQuery: Awaited<ReturnType<typeof parseStructuredQuery>>
  limit?: number
}): Promise<HybridRetrieval> {
  const { supabase, organizationId, aircraftId, queryEmbedding, queryText, question, docTypeFilter, parsedQuery } = args
  const limit = args.limit ?? 8
  const docTypeAllow =
    docTypeFilter && docTypeFilter.length > 0 ? new Set<DocType>(docTypeFilter) : null
  const visionBlendWeight = readVisionBlendWeight()

  type TreeHit = { chunkId: string; sectionHint: string }
  type Bm25Hits = Awaited<ReturnType<typeof searchBm25>>

  // ── Three retrievers fired concurrently. Each resolves to { r, ms } and
  //    never rejects — a failed retriever simply contributes no chunks.
  const vStart = Date.now()
  const vectorP = retrieveChunks({
    organizationId,
    aircraftId,
    queryEmbedding,
    queryText,
    docTypeFilter: docTypeAllow ? [...docTypeAllow] : undefined,
    limit: Math.max(20, limit),
    parsedQuery,
  })
    .then((r) => ({ r, ms: Date.now() - vStart }))
    .catch((err) => {
      console.error('[query] vector retrieval failed:', err)
      return { r: [] as RetrievedChunk[], ms: Date.now() - vStart }
    })

  const bStart = Date.now()
  // BM25 keyword retrieval — query the per-AIRCRAFT index (if an aircraft is
  // in scope) AND the per-ORG REFERENCE index (manuals / ADs / parts catalogs
  // are relevant regardless of which aircraft is selected — Wave 1.3). Merge,
  // dedupe by chunk_id keeping the higher score. Never rejects.
  const bm25P: Promise<{ r: Bm25Hits; ms: number }> = (async () => {
    try {
      const [aircraftHits, referenceHits] = await Promise.all([
        aircraftId ? searchBm25(aircraftId, question, 15) : Promise.resolve([] as Bm25Hits),
        searchReferenceBm25(organizationId, question, 15),
      ])
      const byChunk = new Map<string, Bm25Hits[number]>()
      for (const h of [...aircraftHits, ...referenceHits]) {
        const prev = byChunk.get(h.chunk_id)
        if (!prev || h.score > prev.score) byChunk.set(h.chunk_id, h)
      }
      const merged = [...byChunk.values()].sort((a, b) => b.score - a.score).slice(0, 15)
      return { r: merged, ms: Date.now() - bStart }
    } catch (err) {
      console.error('[query] BM25 retrieval failed:', err)
      return { r: [] as Bm25Hits, ms: Date.now() - bStart }
    }
  })()

  const tStart = Date.now()
  const treeP: Promise<{ r: TreeHit[]; ms: number }> = aircraftId
    ? selectTreeChunkIds(supabase, aircraftId, question)
        .then((r) => ({ r, ms: Date.now() - tStart }))
        .catch((err) => {
          console.error('[query] tree retrieval failed:', err)
          return { r: [] as TreeHit[], ms: Date.now() - tStart }
        })
    : Promise.resolve({ r: [] as TreeHit[], ms: 0 })

  // ── Fourth retriever — ColQwen2 vision index (Wave 1.7c). Best-effort and
  //    purely additive: contributes nothing when vision is unconfigured or
  //    the GPU is unreachable, and never rejects. ──
  const visStart = Date.now()
  const visionP: Promise<{ r: Array<{ chunk_id: string; score: number }>; ms: number }> =
    retrieveVisionChunkHits({ supabase, organizationId, aircraftId, question, limit })
      .then((r) => ({ r, ms: Date.now() - visStart }))
      .catch((err) => {
        console.error('[query] vision retrieval failed:', err)
        return {
          r: [] as Array<{ chunk_id: string; score: number }>,
          ms: Date.now() - visStart,
        }
      })

  const [vec, bm, tr, vis] = await Promise.all([vectorP, bm25P, treeP, visionP])

  // ── Merge + per-retriever normalized scores, keyed by chunk_id ──
  interface Slot { chunk: RetrievedChunk | null; vec: number; bm: number; tree: number; vision: number; sectionHint?: string }
  const slots = new Map<string, Slot>()

  const vMax = Math.max(1e-9, ...vec.r.map((c) => c.combined_score ?? c.vector_score ?? 0))
  for (const c of vec.r) {
    slots.set(c.chunk_id, { chunk: c, vec: (c.combined_score ?? c.vector_score ?? 0) / vMax, bm: 0, tree: 0, vision: 0 })
  }

  const bMax = Math.max(1e-9, ...bm.r.map((h) => h.score))
  for (const h of bm.r) {
    const s = slots.get(h.chunk_id)
    if (s) s.bm = h.score / bMax
    else slots.set(h.chunk_id, { chunk: null, vec: 0, bm: h.score / bMax, tree: 0, vision: 0 })
  }

  tr.r.forEach((t, i) => {
    // Rank-based: the top tree node scores ~1.0, decreasing down the list.
    const treeScore = (tr.r.length - i) / tr.r.length
    const s = slots.get(t.chunkId)
    if (s) { s.tree = Math.max(s.tree, treeScore); s.sectionHint = s.sectionHint ?? t.sectionHint }
    else slots.set(t.chunkId, { chunk: null, vec: 0, bm: 0, tree: treeScore, vision: 0, sectionHint: t.sectionHint })
  })

  // Vision hits — a bonus signal keyed by chunk_id, merged the same way as
  // BM25. The MaxSim score is already 0-1; normalize by the in-set max so the
  // strongest vision page earns the full bonus and the rest scale relative.
  const visMax = Math.max(1e-9, ...vis.r.map((h) => h.score))
  for (const h of vis.r) {
    const s = slots.get(h.chunk_id)
    if (s) s.vision = Math.max(s.vision, h.score / visMax)
    else slots.set(h.chunk_id, { chunk: null, vec: 0, bm: 0, tree: 0, vision: h.score / visMax })
  }

  // ── Hydrate chunks that only BM25 / tree surfaced (no vector RetrievedChunk) ──
  // BM25 now indexes the canonical layer, so its hits are canonical chunk ids;
  // the PageIndex tree may reference either layer. Hydrate from
  // canonical_document_chunks first, then document_chunks for any leftovers.
  const needHydration = [...slots.entries()].filter(([, s]) => !s.chunk).map(([id]) => id)
  if (needHydration.length > 0) {
    const hydrateFromTable = async (
      table: 'canonical_document_chunks' | 'document_chunks',
      ids: string[],
    ) => {
      if (ids.length === 0) return
      const { data: rows } = await supabase
        .from(table)
        .select(
          'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, metadata_json, documents:document_id(title, doc_type)',
        )
        .in('id', ids)
        // P0 SECURITY defense-in-depth — never hydrate a chunk from another
        // org even if a BM25/tree hit somehow surfaced a foreign chunk_id.
        .eq('organization_id', organizationId)
      for (const row of (rows ?? []) as Array<Record<string, any>>) {
        const slot = slots.get(row.id as string)
        if (!slot || slot.chunk) continue
        const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents
        slot.chunk = {
          chunk_id: row.id as string,
          document_id: row.document_id as string,
          document_title: doc?.title ?? 'Document',
          doc_type: (doc?.doc_type ?? 'miscellaneous') as DocType,
          aircraft_id: (row.aircraft_id as string | null) ?? undefined,
          page_number: typeof row.page_number === 'number' ? row.page_number : 0,
          page_number_end: (row.page_number_end as number | null) ?? undefined,
          section_title: slot.sectionHint ?? (row.section_title as string | null) ?? undefined,
          chunk_text: (row.chunk_text as string) ?? '',
          metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
          vector_score: 0,
          keyword_score: 0,
          combined_score: 0,
        }
      }
    }
    try {
      await hydrateFromTable('canonical_document_chunks', needHydration)
      const stillMissing = needHydration.filter((id) => !slots.get(id)?.chunk)
      await hydrateFromTable('document_chunks', stillMissing)
    } catch (err) {
      console.error('[query] hybrid chunk hydration failed:', err)
    }
  }

  // ── Weighted rank → top `limit` ──
  //
  // Doc-type filter is applied to the MERGED, hydrated candidate set: the
  // vector retriever already filtered at SQL level, but BM25 + tree surfaced
  // their chunks unfiltered, so we drop any merged chunk whose doc_type is
  // outside the allow-set here, before ranking.
  // Doc-type filter is a SOFT signal, not a hard gate. A topic-INFERRED
  // doc_type guess must never *exclude* a genuinely relevant chunk (the
  // historical "no records found" false-empty class of bug). Chunks outside
  // the allow-set are kept but demoted; the cross-encoder reranker below then
  // judges true relevance over the full pool — so doc-type can only add
  // precision, never starve recall.
  const merged = [...slots.values()]
    .filter((s): s is Slot & { chunk: RetrievedChunk } => s.chunk != null)
    .map((s) => {
      const docTypeMatch = !docTypeAllow || docTypeAllow.has(s.chunk.doc_type)
      return {
        ...s.chunk,
        vector_score: s.vec,
        keyword_score: s.bm,
        combined_score:
          (s.vec * 0.45 + s.bm * 0.35 + s.tree * 0.2 + s.vision * visionBlendWeight) *
          (docTypeMatch ? 1 : 0.5),
      }
    })
    .sort((a, b) => b.combined_score - a.combined_score)

  // ── Wave 1 — cross-encoder rerank ──
  // The weighted blend above is a recall filter; a cross-encoder rerank is
  // the precision pass. Take a wide candidate pool from the merge, rerank by
  // true query relevance, keep the top `limit`. Best-effort: with no
  // COHERE_API_KEY this returns the merge order unchanged (identity).
  const rerankPool = merged.slice(0, Math.max(limit * 4, 30))
  const { chunks: ranked, reranked } = await rerankChunks(question, rerankPool, limit)

  const strategiesUsed: string[] = []
  if (vec.r.length > 0) strategiesUsed.push('vector')
  if (bm.r.length > 0) strategiesUsed.push('bm25')
  if (tr.r.length > 0) strategiesUsed.push('tree')
  if (vis.r.length > 0) strategiesUsed.push('vision')
  if (reranked) strategiesUsed.push('rerank')

  return {
    chunks: ranked,
    strategiesUsed,
    latencies: { vector: vec.ms, bm25: bm.ms, tree: tr.ms, vision: vis.ms },
    treeNodesUsed: tr.r.length,
  }
}

// ─── Aggregation answer path ─────────────────────────────────────────────────
//
// For count / list / sum / first / last queries we run a structured event
// extraction pass over a wider chunk set, deduplicate near-identical events,
// then ground the answer in that exhaustive event list. Only the chunks that
// the extracted events actually came from are handed to generateAnswer +
// citation enrichment, so the inline [N] citations point at real sources.
//
// On any extraction failure this falls back to the normal generateAnswer over
// the (already wider, top-25) retrieved chunks.

/** Extracted topic noun for an empty-state "No records found for X" message. */
function aggregationTopic(question: string): string {
  return question.replace(/[?]+\s*$/, '').trim()
}

// The structured event list is drawn from the maintenance records on file —
// it is not, and cannot claim to be, the complete real-world history. This
// line is appended to every aggregation answer so the model states that basis
// honestly rather than implying an exhaustive count.
const AGGREGATION_BASIS_NOTE =
  'BASIS: the events above are the maintenance records currently on file — ' +
  'transcribed-and-approved logbook entries plus retrieved document pages. ' +
  'In your answer, explicitly state that the result reflects the records on ' +
  'file and may not include logbook entries that have not yet been uploaded, ' +
  'transcribed, or approved. Do not imply the count is the complete history.'

// The model is told to state the basis (above) but only does so ~half the
// time, so we also append it deterministically when it is missing — every
// substantive aggregation answer then carries the caveat.
const BASIS_SENTENCE =
  ' (Based on the maintenance records currently on file — this may not ' +
  'include logbook entries that have not yet been uploaded, transcribed, or ' +
  'approved.)'
const BASIS_PRESENT_RE = /on file|may not include|not yet been (uploaded|transcribed|approved)/i

function appendBasisIfMissing(result: Awaited<ReturnType<typeof generateAnswer>>): void {
  if (
    result.answer &&
    result.confidence !== 'insufficient_evidence' &&
    !BASIS_PRESENT_RE.test(result.answer)
  ) {
    result.answer = `${result.answer.trimEnd()}${BASIS_SENTENCE}`
  }
}

/**
 * Build a count answer deterministically from a SQL count + structured-event
 * exemplars — no extraction or generation LLM call. count questions go through
 * here once the count is known: the number is exact (SQL), and routing the
 * answer through the generation model only made it slow (p90 60s+, occasional
 * 128s hangs) and unreliable (the model recounted the excerpts and ignored the
 * figure). Exemplars come straight from the structured events, already carrying
 * real document_id + page_number for citations.
 */
function buildCountAnswer(args: {
  countValue: number
  approximate: boolean
  label: string
  keywords: string[]
  structuredChunks: RetrievedChunk[]
}): { answerResult: Awaited<ReturnType<typeof generateAnswer>>; answerChunks: RetrievedChunk[] } {
  const { countValue, approximate, label, keywords, structuredChunks } = args
  const lc = keywords.map((k) => k.toLowerCase())
  const matching =
    lc.length > 0
      ? structuredChunks.filter((c) => lc.some((k) => c.chunk_text.toLowerCase().includes(k)))
      : structuredChunks
  const exemplars = (matching.length > 0 ? matching : structuredChunks).slice(0, 10)
  const citations = exemplars.map(buildAnswerCitationFromChunk)

  let answer: string
  if (countValue <= 0) {
    answer = `No ${label} were found in the maintenance records on file for this aircraft.${BASIS_SENTENCE}`
  } else {
    const lead = approximate
      ? `Based on the maintenance records on file, there are approximately ${countValue} ${label} for this aircraft — this is a keyword match over transcribed records, so treat it as an estimate.`
      : `Based on the maintenance records on file, this aircraft has ${countValue} ${label}.`
    const lines = exemplars.map(
      (c, i) => `${i + 1}. ${c.chunk_text.replace(/\s+/g, ' ').slice(0, 200)} [${i + 1}]`,
    )
    answer =
      lead +
      (exemplars.length > 0 ? `\n\nRepresentative records:\n${lines.join('\n')}` : '') +
      BASIS_SENTENCE
  }

  return {
    answerResult: {
      answer,
      confidence: countValue <= 0 ? 'insufficient_evidence' : approximate ? 'medium' : 'high',
      confidenceScore: countValue <= 0 ? 0 : approximate ? 0.6 : 0.9,
      citations,
      citedChunkIds: exemplars.map((c) => c.chunk_id),
      warningFlags: [],
      followUpQuestions: [],
      tokensPrompt: 0,
      tokensCompletion: 0,
    },
    answerChunks: exemplars,
  }
}

/**
 * Build a first/last answer deterministically from one maintenance_events
 * row — an exact ORDER BY event_date result, no LLM extraction. The matching
 * synthetic chunk from fetchStructuredEventChunks carries the real
 * document_id + page, so the [1] citation opens the correct PDF page. If that
 * chunk is not in the structured set, returns null so the caller falls through
 * to the LLM-extraction path — an answer's citations must always resolve.
 */
function buildFirstLastAnswer(args: {
  event: MaintenanceEventRow
  aggregationType: 'first' | 'last'
  structuredChunks: RetrievedChunk[]
}): { answerResult: Awaited<ReturnType<typeof generateAnswer>>; answerChunks: RetrievedChunk[] } | null {
  const { event, aggregationType, structuredChunks } = args
  const chunk = structuredChunks.find(
    (c) =>
      (c.metadata_json as { maintenance_event_id?: string } | null | undefined)
        ?.maintenance_event_id === event.id,
  )
  if (!chunk) return null
  const detail = (event.description ?? event.event_type ?? 'a maintenance record')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)
  const ordinal = aggregationType === 'first' ? 'earliest' : 'most recent'
  const dated = event.event_date ? `dated ${event.event_date}` : 'with no recorded date'
  const answer =
    `The ${ordinal} maintenance record on file for this aircraft is ${dated}: ` +
    `${detail} [1].${BASIS_SENTENCE}`
  return {
    answerResult: {
      answer,
      confidence: 'high',
      confidenceScore: 0.9,
      citations: [buildAnswerCitationFromChunk(chunk)],
      citedChunkIds: [chunk.chunk_id],
      warningFlags: [],
      followUpQuestions: [],
      tokensPrompt: 0,
      tokensCompletion: 0,
    },
    answerChunks: [chunk],
  }
}

async function runAggregationAnswer(args: {
  question: string
  cleanedQuery: string
  aggregationType: AggregationType
  retrievedChunks: RetrievedChunk[]
  supabase: ReturnType<typeof createServiceSupabase>
  organizationId: string
  aircraftId?: string | null
  parsedQuery: Awaited<ReturnType<typeof parseStructuredQuery>>
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{
  answerResult: Awaited<ReturnType<typeof generateAnswer>>
  answerChunks: RetrievedChunk[]
}> {
  const {
    question,
    cleanedQuery,
    aggregationType,
    retrievedChunks,
    supabase,
    organizationId,
    aircraftId,
    parsedQuery,
    conversationHistory,
  } = args

  // Recall booster: retrieved chunks alone undercount aggregation answers
  // (page-recall@20 ~31%). Pull the org/aircraft's structured maintenance
  // events and extract over the union so list/first/last sees events whose
  // chunk was never retrieved. Best-effort — [] on any failure.
  //
  // For count questions the count itself comes from SQL, not chunk extraction
  // (the LLM cannot reliably count across hundreds of events): totalRecords is
  // the exact count(*) of all the aircraft's records, and deriveCountTopic
  // classifies whether the question wants that grand total or a work-type count.
  const isCountQuery = aggregationType === 'count' && Boolean(aircraftId)
  const [structuredChunks, totalRecords, countTopic] = await Promise.all([
    fetchStructuredEventChunks({
      supabase,
      organizationId,
      aircraftId,
      parsedQuery,
      aggregationType,
    }),
    isCountQuery
      ? countAircraftMaintenanceEvents(supabase, organizationId, aircraftId as string)
      : Promise.resolve(null),
    isCountQuery ? deriveCountTopic(question) : Promise.resolve(null),
  ])
  const augmentedChunks = retrievedChunks.concat(structuredChunks)

  // count questions: resolve the count from SQL and answer deterministically,
  // skipping the extraction + generation LLM machinery. If classification
  // failed (countTopic empty) we fall through to the extraction path below.
  if (isCountQuery && countTopic) {
    if (countTopic.isGrandTotal && totalRecords != null) {
      return buildCountAnswer({
        countValue: totalRecords,
        approximate: false,
        label: 'maintenance records on file',
        keywords: [],
        structuredChunks,
      })
    }
    if (countTopic.keywords.length > 0) {
      const matched = await countEventsMatching(
        supabase,
        organizationId,
        aircraftId as string,
        countTopic.keywords,
      )
      if (matched != null) {
        return buildCountAnswer({
          countValue: matched,
          approximate: true,
          label: `maintenance records mentioning "${countTopic.keywords.join('" / "')}"`,
          keywords: countTopic.keywords,
          structuredChunks,
        })
      }
    }
  }

  // first / last: a grand-total first/last ("most recent maintenance record",
  // "first logbook entry") is answered by an exact ORDER BY event_date query
  // against maintenance_events, skipping the LLM extraction pass. A work-type
  // first/last ("last annual") has no reliable SQL form — event_type and
  // description are free text — so it falls through to the extraction path.
  if ((aggregationType === 'first' || aggregationType === 'last') && aircraftId) {
    if (deriveCountTopic(question).isGrandTotal) {
      const flEvent = await firstLastMaintenanceEvent(
        supabase,
        organizationId,
        aircraftId,
        aggregationType,
      )
      if (flEvent) {
        const built = buildFirstLastAnswer({ event: flEvent, aggregationType, structuredChunks })
        if (built) return built
      }
    }
  }

  try {
    const events = await extractAggregationEvents(cleanedQuery, augmentedChunks)

    // Extraction found nothing — report it honestly. NEVER report 0 as a
    // count answer.
    if (events.length === 0) {
      return {
        answerResult: {
          answer: `No records found for ${aggregationTopic(question)}.`,
          confidence: 'insufficient_evidence',
          confidenceScore: 0,
          citations: [],
          citedChunkIds: [],
          warningFlags: ['partial_information'],
          followUpQuestions: [],
          tokensPrompt: 0,
          tokensCompletion: 0,
        },
        answerChunks: [],
      }
    }

    // For first/last, narrow to the single chosen event.
    const finalEvents =
      aggregationType === 'first' || aggregationType === 'last'
        ? (() => {
            const picked = pickFirstOrLastEvent(events, aggregationType)
            return picked ? [picked] : events
          })()
        : events

    // Keep only the chunks the final events were sourced from so the
    // inline [N] citations resolve to real sources. Filter the augmented set
    // so structured-event chunks (mev: synthetic ids) resolve too.
    const sourceIds = new Set(
      finalEvents
        .map((e) => e.source_chunk_id)
        .filter((id): id is string => Boolean(id)),
    )
    const sourceChunks = augmentedChunks.filter((c) => sourceIds.has(c.chunk_id))
    // If the model gave no usable source ids, fall back to the full set so
    // the answer is still grounded and citations still resolve.
    const answerChunks = sourceChunks.length > 0 ? sourceChunks : augmentedChunks

    // Build an augmented question: the structured event list is appended so
    // the answer model counts/enumerates from the deduplicated events rather
    // than guessing from raw chunk text. The instruction tells it how to
    // respond per aggregation type.
    const structuredContext = formatAggregationContext(question, aggregationType, finalEvents)
    // count only reaches here as a fallback (SQL count classification failed);
    // the chunk-extraction figure is the best available in that case.
    const directive =
      aggregationType === 'count'
        ? `State the count (${finalEvents.length}) explicitly, then list each event with its citation.`
        : aggregationType === 'list'
          ? 'Provide the full list of events; each event must be its own line with a citation.'
          : aggregationType === 'sum'
            ? 'Sum the relevant values across the events and show the total, citing each contributing event.'
            : `Report the single ${aggregationType} event below with its date and citation.`

    const augmentedQuestion =
      `${question}\n\n` +
      `[STRUCTURED EXTRACTION — answer using ONLY these deduplicated events]\n` +
      `${structuredContext}\n\n` +
      `INSTRUCTION: ${directive}\n\n` +
      `${AGGREGATION_BASIS_NOTE}`

    const answerResult = await generateAnswer(augmentedQuestion, answerChunks, conversationHistory)
    appendBasisIfMissing(answerResult)
    return { answerResult, answerChunks }
  } catch (err) {
    // Extraction pass failed — fall back to the normal generateAnswer over
    // the augmented chunk set (retrieved + structured maintenance events).
    console.error('[query] aggregation extraction failed — falling back to generateAnswer:', err)
    const answerResult = await generateAnswer(question, augmentedChunks, conversationHistory)
    appendBasisIfMissing(answerResult)
    return { answerResult, answerChunks: augmentedChunks }
  }
}

// ─── POST /api/query ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  const supabase = createServiceSupabase();
  const user = await getRequestUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestContext = await resolveRequestOrgContext(req, { includeOrganization: true })

  if (!requestContext) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });
  }

  const { organizationId, organization: org } = requestContext

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
  }

  // 3. Check query quota
  if (org.queries_used_this_month >= org.plan_queries_monthly) {
    return NextResponse.json(
      {
        error: 'Monthly query limit reached',
        details: {
          used: org.queries_used_this_month,
          limit: org.plan_queries_monthly,
          resets_at: org.queries_reset_at,
        },
      },
      { status: 429 }
    );
  }

  // 4. Parse + validate request body
  let body: z.infer<typeof queryRequestSchema>;
  try {
    const raw = await req.json();
    body = queryRequestSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request body', details: err.errors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { question, aircraft_id, doc_type_filter, conversation_history } = body;
  const persona = body.persona ?? 'owner';

  try {
    // ── P0 SECURITY — verify a body-supplied aircraft_id belongs to the
    // caller's org. /api/query runs on the service client (RLS bypassed); the
    // BM25 index and PageIndex tree are keyed by aircraft_id alone, so without
    // this check a caller could pass another org's aircraft_id and pull that
    // org's chunks. Inside the try so a DB hiccup returns a JSON 500, not an
    // uncaught crash that surfaces as an opaque platform error.
    if (aircraft_id) {
      const { data: ownedAircraft, error: ownedAircraftError } = await supabase
        .from('aircraft')
        .select('id')
        .eq('id', aircraft_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (ownedAircraftError) {
        return NextResponse.json(
          { error: 'Could not verify aircraft ownership', details: ownedAircraftError.message },
          { status: 500 },
        )
      }
      if (!ownedAircraft) {
        return NextResponse.json(
          { error: 'Aircraft not found in your organization' },
          { status: 403 },
        )
      }
    }

    // ── 1. Structured query parse — cleanedQuery + any explicit filters ──
    const parsedQuery = await parseStructuredQuery({
      organizationId,
      aircraftId: aircraft_id,
      docTypeFilter: doc_type_filter,
      queryText: question,
    })

    const cleanedQuery = parsedQuery.cleanedQuery || question

    // ── 2. Doc-type pre-filter. An EXPLICIT filter from the structured
    //    parse (doc:… token or request doc_type_filter) always wins; the
    //    topic-inferred filter is used only when no explicit one exists. ──
    const explicitDocTypeFilter =
      parsedQuery.docTypeFilter && parsedQuery.docTypeFilter.length > 0
        ? parsedQuery.docTypeFilter
        : null
    let inferredDocTypeFilter: DocType[] | null = null
    if (!explicitDocTypeFilter) {
      const inferred = inferRelevantDocTypes(cleanedQuery)
      inferredDocTypeFilter = inferred ? (inferred as DocType[]) : null
    }
    const effectiveDocTypeFilter: DocType[] | null =
      explicitDocTypeFilter ?? inferredDocTypeFilter

    // Phase 1 — query-router SHADOW mode. Compute the router's would-be
    // retrieval strategy WITHOUT acting on it: the four-retriever hybrid pass
    // below still runs unchanged. Lets the routing be measured on real traffic
    // before any active routing is enabled. Gated by ROUTER_SHADOW; fired
    // concurrently so it adds no latency to the answer; failure is swallowed.
    const routerShadowP: Promise<RouteDecision | null> =
      process.env.ROUTER_SHADOW === 'true'
        ? routeQueryVerbose(question, {
            docTypes: effectiveDocTypeFilter ?? undefined,
          }).catch((err) => {
            console.warn('[query] router shadow failed (ignored):', err)
            return null
          })
        : Promise.resolve(null)

    // ── 3. Aggregation-query detection — count / list / sum / first / last ──
    const aggregation = detectAggregationQuery(cleanedQuery)

    // A count question scoped to one aircraft with a resolvable topic is
    // answered by an exact SQL count(*) in runAggregationAnswer — it never
    // reads the retrieved chunks. Detect that here so the (otherwise
    // discarded) hybrid retrieval can be skipped for it.
    const sqlDirectCount =
      aggregation.isAggregation &&
      aggregation.aggregationType === 'count' &&
      Boolean(parsedQuery.aircraftId ?? aircraft_id) &&
      (() => {
        const topic = deriveCountTopic(question)
        return topic.isGrandTotal || topic.keywords.length > 0
      })()

    // ── 4. Dual embed (HyDE). In parallel: generate the hypothetical
    //    logbook entry AND embed the real query. Then embed the hypothetical.
    //    Vector search uses the HyDE embedding; BM25 + tree keep the real
    //    query terms. On any HyDE failure, the hypothetical equals the
    //    question and we fall back to the real query embedding. ──
    const [hypothetical, [realQueryEmbeddingResult]] = await Promise.all([
      generateHypotheticalDocument(cleanedQuery, persona),
      generateEmbeddings([{ id: 'query', text: cleanedQuery }]),
    ])
    const realQueryEmbedding = realQueryEmbeddingResult.embedding

    const hydeUsed = hypothetical.trim() !== cleanedQuery.trim()
    const hydeHypothetical = hydeUsed ? hypothetical.slice(0, 500) : null

    let vectorEmbedding = realQueryEmbedding
    if (hydeUsed) {
      try {
        const [hydeEmbeddingResult] = await generateEmbeddings([
          { id: 'hyde', text: hypothetical },
        ])
        vectorEmbedding = hydeEmbeddingResult.embedding
      } catch (err) {
        // Embedding the hypothetical failed — fall back to the real query
        // embedding so retrieval still runs.
        console.error('[query] HyDE embedding failed — using query embedding:', err)
        vectorEmbedding = realQueryEmbedding
      }
    }

    // ── 5. Hybrid retrieval — vector + BM25 + tree CONCURRENTLY, merged,
    //    weighted-ranked. Aggregation queries pull a wider set (25) so the
    //    extraction pass can enumerate exhaustively; otherwise top 16.
    //    Bumped from 8 → 16 to fix a recurring miss on handwritten
    //    historical logbooks: the relevant chunk (the actual handwritten
    //    entry) was often crowded out of the top 8 by adjacent chunks
    //    whose embeddings were dominated by the printed-form boilerplate
    //    header that appears on every page. 16 gives the answer-gen pass
    //    enough surrounding context to find the specific entry without
    //    a full re-chunk of every legacy doc.
    //    Falls back to vector-only if hybrid throws. ──
    const retrievalLimit = aggregation.isAggregation ? 25 : 16
    let retrievedChunks: RetrievedChunk[]
    let strategiesUsed: string[] = ['vector']
    let retrieverLatencies: HybridRetrieval['latencies'] = { vector: 0, bm25: 0, tree: 0, vision: 0 }
    let treeNodesUsed = 0
    let docTypeFallbackTriggered = false

    const runHybrid = (filter: DocType[] | null) =>
      hybridRetrieve({
        supabase,
        organizationId,
        aircraftId: parsedQuery.aircraftId ?? aircraft_id,
        queryEmbedding: vectorEmbedding,
        queryText: cleanedQuery,
        question: cleanedQuery,
        docTypeFilter: filter,
        parsedQuery,
        limit: retrievalLimit,
      })

    if (sqlDirectCount) {
      // Exact SQL count path — runAggregationAnswer answers from count(*) and
      // never reads these chunks. Skip the otherwise-discarded retrieval.
      retrievedChunks = []
    } else try {
      let hybrid = await runHybrid(effectiveDocTypeFilter)

      // Doc-type fallback: a filtered retrieval that yields <3 chunks is
      // re-run once unfiltered so a too-narrow filter never starves the
      // answer. All three retrievers always run on each pass.
      if (effectiveDocTypeFilter && hybrid.chunks.length < 3) {
        console.warn(
          `[query] doc-type filter [${effectiveDocTypeFilter.join(',')}] returned ` +
            `${hybrid.chunks.length} chunks (<3) — retrying unfiltered`,
        )
        docTypeFallbackTriggered = true
        hybrid = await runHybrid(null)
      }

      retrievedChunks = hybrid.chunks
      strategiesUsed = hybrid.strategiesUsed.length > 0 ? hybrid.strategiesUsed : ['vector']
      retrieverLatencies = hybrid.latencies
      treeNodesUsed = hybrid.treeNodesUsed
    } catch (err) {
      console.error('[query] hybrid retrieval failed — falling back to vector-only:', err)
      retrievedChunks = await retrieveChunks({
        organizationId,
        aircraftId: parsedQuery.aircraftId ?? aircraft_id,
        queryEmbedding: vectorEmbedding,
        queryText: cleanedQuery,
        docTypeFilter: effectiveDocTypeFilter ?? undefined,
        limit: Math.max(20, retrievalLimit),
        parsedQuery,
      });
    }

    // ── 6. Answer generation. Aggregation queries run a structured event
    //    extraction pass first; non-aggregation queries use the normal
    //    top-8 generateAnswer flow unchanged. ──
    let answerResult: Awaited<ReturnType<typeof generateAnswer>>
    let answerChunks: RetrievedChunk[] = retrievedChunks

    if (aggregation.isAggregation) {
      const handled = await runAggregationAnswer({
        question,
        cleanedQuery,
        aggregationType: aggregation.aggregationType!,
        retrievedChunks,
        supabase,
        organizationId,
        aircraftId: parsedQuery.aircraftId ?? aircraft_id ?? null,
        parsedQuery,
        conversationHistory: conversation_history,
      })
      answerResult = handled.answerResult
      answerChunks = handled.answerChunks
    } else {
      answerResult = await generateAnswer(question, retrievedChunks, conversation_history)
      answerChunks = retrievedChunks
    }

    const enrichedCitations = await enrichAnswerCitationsWithAnchors({
      citations: answerResult.citations,
      retrievedChunks: answerChunks,
      supabase,
    })

    const latencyMs = Date.now() - startTime;

    // 8. Store query record in queries table
    const docTypesSearched: DocType[] = parsedQuery.docTypeFilter && parsedQuery.docTypeFilter.length > 0
      ? parsedQuery.docTypeFilter
      : Array.from(new Set(retrievedChunks.map((c) => c.doc_type)));

    const { data: queryRecord, error: queryInsertError } = await supabase
      .from('queries')
      .insert({
        organization_id: organizationId,
        aircraft_id: parsedQuery.aircraftId ?? aircraft_id ?? null,
        user_id: user.id,
        question,
        answer: answerResult.answer,
        confidence: answerResult.confidence,
        confidence_score: answerResult.confidenceScore,
        doc_types_searched: docTypesSearched,
        chunks_retrieved: retrievedChunks.length,
        chunks_used: answerResult.citedChunkIds.length,
        model_used: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
        tokens_prompt: answerResult.tokensPrompt,
        tokens_completion: answerResult.tokensCompletion,
        latency_ms: latencyMs,
        warning_flags: answerResult.warningFlags,
        follow_up_questions: answerResult.followUpQuestions,
        is_bookmarked: false,
      })
      .select('id')
      .single();

    if (queryInsertError || !queryRecord) {
      console.error('[query POST] Failed to store query record:', queryInsertError);
      // Non-fatal — still return the answer to the user
    }

    // 9. Store citations in citations table
    if (queryRecord && enrichedCitations.length > 0) {
      const citationRows = enrichedCitations.map((citation, idx) => ({
        query_id: queryRecord.id,
        organization_id: organizationId,
        document_id: citation.documentId,
        chunk_id: citation.chunkId,
        page_number: citation.pageNumber,
        page_number_end: citation.pageNumberEnd ?? null,
        section_title: citation.sectionTitle ?? null,
        quoted_snippet: citation.snippet,
        quoted_text: citation.quotedText ?? citation.snippet,
        normalized_quoted_text: citation.normalizedQuotedText ?? null,
        match_strategy: citation.matchStrategy ?? null,
        text_anchor_start:
          typeof citation.textAnchorStart === 'number' ? citation.textAnchorStart : null,
        text_anchor_end:
          typeof citation.textAnchorEnd === 'number' ? citation.textAnchorEnd : null,
        bounding_regions: citation.boundingRegions ?? [],
        is_exact_anchor: citation.isExactAnchor ?? false,
        relevance_score: citation.relevanceScore,
        citation_index: idx + 1,
      }));

      const { error: citationsError } = await supabase
        .from('citations')
        .insert(citationRows);

      if (citationsError) {
        console.error('[query POST] Failed to store citations:', citationsError);
      }
    }

    // 10. Increment query counter via increment_query_count RPC
    const { error: incrementError } = await supabase.rpc('increment_query_count', {
      p_org_id: organizationId,
    });

    if (incrementError) {
      console.error('[query POST] Failed to increment query count:', incrementError);
    }

    // 11. Log the query outcome to the RAG feedback loop (fire-and-forget).
    //     strategies_used + per-retriever latency + a slow_query flag for
    //     monitoring. rag_query_log persists strategy + total duration; the
    //     per-retriever breakdown goes to the server log.
    const slowQuery = latencyMs > 3000
    console.log(
      `[query] hybrid retrieval — strategies=${strategiesUsed.join('+')} ` +
        `latency_ms vector=${retrieverLatencies.vector} bm25=${retrieverLatencies.bm25} ` +
        `tree=${retrieverLatencies.tree} vision=${retrieverLatencies.vision} ` +
        `total=${latencyMs} slow_query=${slowQuery}`,
    )
    const routerShadow = await routerShadowP

    void logQueryResult({
      org_id: organizationId,
      aircraft_id: parsedQuery.aircraftId ?? aircraft_id ?? null,
      query: question,
      strategy: strategiesUsed.join('+'),
      chunk_count: retrievedChunks.length,
      tree_nodes_used: treeNodesUsed,
      answer_length: answerResult.answer.length,
      duration_ms: latencyMs,
      hyde_used: hydeUsed,
      hyde_hypothetical: hydeHypothetical,
      doc_type_filter_used: effectiveDocTypeFilter
        ? effectiveDocTypeFilter.join(',')
        : null,
      doc_type_fallback_triggered: docTypeFallbackTriggered,
      router_shadow: routerShadow,
    });

    // 12. Return response
    return NextResponse.json({
      query_id: queryRecord?.id ?? null,
      answer: answerResult.answer,
      confidence: answerResult.confidence,
      confidence_score: answerResult.confidenceScore,
      citations: enrichedCitations,
      cited_chunk_ids: answerResult.citedChunkIds,
      citedChunkIds: answerResult.citedChunkIds,
      warning_flags: answerResult.warningFlags,
      follow_up_questions: answerResult.followUpQuestions,
      chunks_retrieved: retrievedChunks.length,
      latency_ms: latencyMs,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - startTime;

    console.error('[query POST] Unhandled error:', errorMessage);

    return NextResponse.json(
      { error: 'An error occurred while processing your query', details: errorMessage, latency_ms: latencyMs },
      { status: 500 }
    );
  }
}
