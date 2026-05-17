import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/request-user';
import { resolveRequestOrgContext } from '@/lib/auth/context';
import { generateEmbeddings } from '@/lib/openai/embeddings';
import { retrieveChunks } from '@/lib/rag/retrieval';
import { generateAnswer } from '@/lib/rag/generation';
import { parseStructuredQuery } from '@/lib/rag/query-parser';
import { enrichAnswerCitationsWithAnchors } from '@/lib/rag/citation-anchors';
import { routeQuery, indexesForStrategy, type QueryStrategy } from '@/lib/rag/query-router';
import { searchBm25 } from '@/lib/rag/bm25-index';
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

async function applyPageIndexEnhancement(args: {
  supabase: ReturnType<typeof createServiceSupabase>
  strategy: QueryStrategy
  aircraftId?: string
  question: string
  vectorChunks: RetrievedChunk[]
}): Promise<RetrievedChunk[]> {
  const { supabase, strategy, aircraftId, question, vectorChunks } = args
  const idx = indexesForStrategy(strategy)
  if (!aircraftId || (!idx.bm25 && !idx.tree)) return vectorChunks

  const have = new Set(vectorChunks.map((c) => c.chunk_id))
  // chunk_id → { keywordScore, sectionHint } for chunks the vector pass missed.
  const extra = new Map<string, { keywordScore: number; sectionHint?: string }>()

  if (idx.bm25) {
    try {
      const hits = await searchBm25(aircraftId, question, 15)
      const max = Math.max(1, ...hits.map((h) => h.score))
      for (const hit of hits) {
        if (!have.has(hit.chunk_id) && !extra.has(hit.chunk_id)) {
          extra.set(hit.chunk_id, { keywordScore: hit.score / max })
        }
      }
    } catch (err) {
      console.error('[query] BM25 retrieval failed (vector results unaffected):', err)
    }
  }

  if (idx.tree) {
    try {
      for (const { chunkId, sectionHint } of await selectTreeChunkIds(supabase, aircraftId, question)) {
        if (!have.has(chunkId)) {
          const existing = extra.get(chunkId)
          extra.set(chunkId, { keywordScore: existing?.keywordScore ?? 0.6, sectionHint })
        }
      }
    } catch (err) {
      console.error('[query] PageIndex tree retrieval failed (vector results unaffected):', err)
    }
  }

  if (extra.size === 0) return vectorChunks

  try {
    const { data: rows } = await supabase
      .from('document_chunks')
      .select(
        'id, document_id, aircraft_id, page_number, page_number_end, section_title, chunk_text, metadata_json, documents:document_id(title, doc_type)',
      )
      .in('id', Array.from(extra.keys()))

    const merged = [...vectorChunks]
    for (const row of (rows ?? []) as Array<Record<string, any>>) {
      const doc = Array.isArray(row.documents) ? row.documents[0] : row.documents
      const meta = extra.get(row.id as string)!
      merged.push({
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        document_title: doc?.title ?? 'Document',
        doc_type: (doc?.doc_type ?? 'miscellaneous') as DocType,
        aircraft_id: (row.aircraft_id as string | null) ?? undefined,
        page_number: typeof row.page_number === 'number' ? row.page_number : 0,
        page_number_end: (row.page_number_end as number | null) ?? undefined,
        section_title: meta.sectionHint ?? (row.section_title as string | null) ?? undefined,
        chunk_text: (row.chunk_text as string) ?? '',
        metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
        vector_score: 0,
        keyword_score: meta.keywordScore,
        // Exact keyword / located-tree hits rank near the top — that is the
        // whole point (vector search misses exact part / AD / serial strings).
        combined_score: 0.6 + meta.keywordScore * 0.35,
      })
    }
    return merged
  } catch (err) {
    console.error('[query] PageIndex chunk hydration failed (vector results unaffected):', err)
    return vectorChunks
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

  try {
    const parsedQuery = await parseStructuredQuery({
      organizationId,
      aircraftId: aircraft_id,
      docTypeFilter: doc_type_filter,
      queryText: question,
    })

    const embeddingText = parsedQuery.cleanedQuery || question

    // 5. Generate query embedding
    const [embeddingResult] = await generateEmbeddings([{ id: 'query', text: embeddingText }]);
    const queryEmbedding = embeddingResult.embedding;

    // 6. Retrieve chunks via retrieveChunks
    const retrievedChunks = await retrieveChunks({
      organizationId,
      aircraftId: parsedQuery.aircraftId ?? aircraft_id,
      queryEmbedding,
      queryText: embeddingText,
      docTypeFilter: parsedQuery.docTypeFilter ?? doc_type_filter,
      limit: 20,
      parsedQuery,
    });

    // 7. Generate answer via generateAnswer
    const answerResult = await generateAnswer(
      question,
      retrievedChunks,
      conversation_history
    );

    const enrichedCitations = await enrichAnswerCitationsWithAnchors({
      citations: answerResult.citations,
      retrievedChunks,
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

    // 11. Return response
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
