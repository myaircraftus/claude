import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { generateEmbeddings } from '@/lib/openai/embeddings';
import { retrieveChunks } from '@/lib/rag/retrieval';
import { generateAnswer } from '@/lib/rag/generation';
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

  // 1. Auth check
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Get user's org membership (single org supported)
  const { data: membership, error: membershipError } = await supabase
    .from('organization_memberships')
    .select(
      `
      organization_id,
      role,
      organizations:organization_id (
        id,
        plan,
        plan_queries_monthly,
        queries_used_this_month,
        queries_reset_at
      )
    `
    )
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });
  }

  const org = (membership.organizations as unknown) as {
    id: string;
    plan: string;
    plan_queries_monthly: number;
    queries_used_this_month: number;
    queries_reset_at: string;
  } | null;

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
  const organizationId = membership.organization_id;

  try {
    // 5. Generate query embedding
    const [embeddingResult] = await generateEmbeddings([{ id: 'query', text: question }]);
    const queryEmbedding = embeddingResult.embedding;

    // 6. Retrieve chunks via retrieveChunks
    const retrievedChunks = await retrieveChunks({
      organizationId,
      aircraftId: aircraft_id,
      queryEmbedding,
      queryText: question,
      docTypeFilter: doc_type_filter,
      limit: 20,
    });

    // 7. Generate answer via generateAnswer
    const answerResult = await generateAnswer(
      question,
      retrievedChunks,
      conversation_history
    );

    const latencyMs = Date.now() - startTime;

    // 8. Store query record in queries table
    const serviceClient = createServiceSupabase();

    const docTypesSearched: DocType[] = doc_type_filter && doc_type_filter.length > 0
      ? doc_type_filter
      : Array.from(new Set(retrievedChunks.map((c) => c.doc_type)));

    const { data: queryRecord, error: queryInsertError } = await serviceClient
      .from('queries')
      .insert({
        organization_id: organizationId,
        aircraft_id: aircraft_id ?? null,
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
    if (queryRecord && answerResult.citations.length > 0) {
      const citationRows = answerResult.citations.map((citation, idx) => ({
        query_id: queryRecord.id,
        organization_id: organizationId,
        document_id: citation.documentId,
        chunk_id: citation.chunkId,
        page_number: citation.pageNumber,
        section_title: citation.sectionTitle ?? null,
        quoted_snippet: citation.snippet,
        relevance_score: citation.relevanceScore,
        citation_index: idx + 1,
      }));

      const { error: citationsError } = await serviceClient
        .from('citations')
        .insert(citationRows);

      if (citationsError) {
        console.error('[query POST] Failed to store citations:', citationsError);
      }
    }

    // 10. Increment query counter via increment_query_count RPC
    const { error: incrementError } = await serviceClient.rpc('increment_query_count', {
      p_organization_id: organizationId,
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
      citations: answerResult.citations,
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
