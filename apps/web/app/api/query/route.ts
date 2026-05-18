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
import { enrichAnswerCitationsWithAnchors } from '@/lib/rag/citation-anchors';
import { searchBm25 } from '@/lib/rag/bm25-index';
import { logQueryResult } from '@/lib/rag/feedback';
import { generateHypotheticalDocument } from '@/lib/rag/hyde';
import { rerankChunks } from '@/lib/rag/rerank';
import {
  extractAggregationEvents,
  formatAggregationContext,
  pickFirstOrLastEvent,
} from '@/lib/rag/aggregation';
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

interface HybridRetrieval {
  chunks: RetrievedChunk[]
  /** Which retrievers returned ≥1 result. */
  strategiesUsed: string[]
  /** Per-retriever wall-clock latency (ms). */
  latencies: { vector: number; bm25: number; tree: number }
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
  const bm25P: Promise<{ r: Bm25Hits; ms: number }> = aircraftId
    ? searchBm25(aircraftId, question, 15)
        .then((r) => ({ r, ms: Date.now() - bStart }))
        .catch((err) => {
          console.error('[query] BM25 retrieval failed:', err)
          return { r: [] as Bm25Hits, ms: Date.now() - bStart }
        })
    : Promise.resolve({ r: [] as Bm25Hits, ms: 0 })

  const tStart = Date.now()
  const treeP: Promise<{ r: TreeHit[]; ms: number }> = aircraftId
    ? selectTreeChunkIds(supabase, aircraftId, question)
        .then((r) => ({ r, ms: Date.now() - tStart }))
        .catch((err) => {
          console.error('[query] tree retrieval failed:', err)
          return { r: [] as TreeHit[], ms: Date.now() - tStart }
        })
    : Promise.resolve({ r: [] as TreeHit[], ms: 0 })

  const [vec, bm, tr] = await Promise.all([vectorP, bm25P, treeP])

  // ── Merge + per-retriever normalized scores, keyed by chunk_id ──
  interface Slot { chunk: RetrievedChunk | null; vec: number; bm: number; tree: number; sectionHint?: string }
  const slots = new Map<string, Slot>()

  const vMax = Math.max(1e-9, ...vec.r.map((c) => c.combined_score ?? c.vector_score ?? 0))
  for (const c of vec.r) {
    slots.set(c.chunk_id, { chunk: c, vec: (c.combined_score ?? c.vector_score ?? 0) / vMax, bm: 0, tree: 0 })
  }

  const bMax = Math.max(1e-9, ...bm.r.map((h) => h.score))
  for (const h of bm.r) {
    const s = slots.get(h.chunk_id)
    if (s) s.bm = h.score / bMax
    else slots.set(h.chunk_id, { chunk: null, vec: 0, bm: h.score / bMax, tree: 0 })
  }

  tr.r.forEach((t, i) => {
    // Rank-based: the top tree node scores ~1.0, decreasing down the list.
    const treeScore = (tr.r.length - i) / tr.r.length
    const s = slots.get(t.chunkId)
    if (s) { s.tree = Math.max(s.tree, treeScore); s.sectionHint = s.sectionHint ?? t.sectionHint }
    else slots.set(t.chunkId, { chunk: null, vec: 0, bm: 0, tree: treeScore, sectionHint: t.sectionHint })
  })

  // ── Hydrate chunks that only BM25 / tree surfaced (no vector RetrievedChunk) ──
  const needHydration = [...slots.entries()].filter(([, s]) => !s.chunk).map(([id]) => id)
  if (needHydration.length > 0) {
    try {
      const { data: rows } = await supabase
        .from('document_chunks')
        .select(
          'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, metadata_json, documents:document_id(title, doc_type)',
        )
        .in('id', needHydration)
        // P0 SECURITY defense-in-depth — never hydrate a chunk from another
        // org even if a BM25/tree hit somehow surfaced a foreign chunk_id.
        .eq('organization_id', organizationId)
      for (const row of (rows ?? []) as Array<Record<string, any>>) {
        const slot = slots.get(row.id as string)
        if (!slot) continue
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
  const merged = [...slots.values()]
    .filter((s): s is Slot & { chunk: RetrievedChunk } => s.chunk != null)
    .filter((s) => !docTypeAllow || docTypeAllow.has(s.chunk.doc_type))
    .map((s) => ({
      ...s.chunk,
      vector_score: s.vec,
      keyword_score: s.bm,
      combined_score: s.vec * 0.45 + s.bm * 0.35 + s.tree * 0.2,
    }))
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
  if (reranked) strategiesUsed.push('rerank')

  return {
    chunks: ranked,
    strategiesUsed,
    latencies: { vector: vec.ms, bm25: bm.ms, tree: tr.ms },
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

async function runAggregationAnswer(args: {
  question: string
  cleanedQuery: string
  aggregationType: AggregationType
  retrievedChunks: RetrievedChunk[]
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{
  answerResult: Awaited<ReturnType<typeof generateAnswer>>
  answerChunks: RetrievedChunk[]
}> {
  const { question, cleanedQuery, aggregationType, retrievedChunks, conversationHistory } = args

  try {
    const events = await extractAggregationEvents(cleanedQuery, retrievedChunks)

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
    // inline [N] citations resolve to real sources.
    const sourceIds = new Set(
      finalEvents
        .map((e) => e.source_chunk_id)
        .filter((id): id is string => Boolean(id)),
    )
    const sourceChunks = retrievedChunks.filter((c) => sourceIds.has(c.chunk_id))
    // If the model gave no usable source ids, fall back to the full set so
    // the answer is still grounded and citations still resolve.
    const answerChunks = sourceChunks.length > 0 ? sourceChunks : retrievedChunks

    // Build an augmented question: the structured event list is appended so
    // the answer model counts/enumerates from the deduplicated events rather
    // than guessing from raw chunk text. The instruction tells it how to
    // respond per aggregation type.
    const structuredContext = formatAggregationContext(question, aggregationType, finalEvents)
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
      `INSTRUCTION: ${directive}`

    const answerResult = await generateAnswer(augmentedQuestion, answerChunks, conversationHistory)
    return { answerResult, answerChunks }
  } catch (err) {
    // Extraction pass failed — fall back to the normal generateAnswer over
    // the (wider, top-25) retrieved chunks.
    console.error('[query] aggregation extraction failed — falling back to generateAnswer:', err)
    const answerResult = await generateAnswer(question, retrievedChunks, conversationHistory)
    return { answerResult, answerChunks: retrievedChunks }
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

  // ── P0 SECURITY — verify a body-supplied aircraft_id belongs to the caller's
  // org. /api/query runs on the service client (RLS bypassed); the BM25 index
  // and PageIndex tree are keyed by aircraft_id alone, so without this check a
  // caller could pass another org's aircraft_id and pull that org's chunks.
  if (aircraft_id) {
    const { data: ownedAircraft } = await supabase
      .from('aircraft')
      .select('id')
      .eq('id', aircraft_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!ownedAircraft) {
      return NextResponse.json(
        { error: 'Aircraft not found in your organization' },
        { status: 403 },
      )
    }
  }

  try {
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

    // ── 3. Aggregation-query detection — count / list / sum / first / last ──
    const aggregation = detectAggregationQuery(cleanedQuery)

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
    //    extraction pass can enumerate exhaustively; otherwise top 8.
    //    Falls back to vector-only if hybrid throws. ──
    const retrievalLimit = aggregation.isAggregation ? 25 : 8
    let retrievedChunks: RetrievedChunk[]
    let strategiesUsed: string[] = ['vector']
    let retrieverLatencies: HybridRetrieval['latencies'] = { vector: 0, bm25: 0, tree: 0 }
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

    try {
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
        `tree=${retrieverLatencies.tree} total=${latencyMs} slow_query=${slowQuery}`,
    )
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
