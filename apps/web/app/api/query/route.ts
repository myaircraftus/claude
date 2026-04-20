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
import type { DocType } from '@/types';

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
