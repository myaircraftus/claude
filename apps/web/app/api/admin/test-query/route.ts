/**
 * POST /api/admin/test-query — internal RAG test harness.
 *
 * Lets Claude run the same retrieveChunks + generateAnswer flow as
 * /api/query without needing a user JWT. Auth via x-internal-secret
 * (PARSER_SERVICE_SECRET). NEVER expose to end users — this is for
 * regression testing and debugging from the operator side only.
 *
 * Request:
 *   { question: string, aircraft_id?: string, organization_id?: string }
 * Response:
 *   { answer, confidence, citations, chunks_retrieved, top_chunks[] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { retrieveChunks } from '@/lib/rag/retrieval'
import { generateAnswer } from '@/lib/rag/generation'
import { parseStructuredQuery } from '@/lib/rag/query-parser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  // Auth — PARSER_SERVICE_SECRET only.
  const internalSecret = process.env.PARSER_SERVICE_SECRET ?? process.env.INTERNAL_SECRET ?? ''
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { question?: string; aircraft_id?: string; organization_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const question = (body.question ?? '').trim()
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

  // Default org = info@myaircraft.us's org if no org_id passed.
  const service = createServiceSupabase()
  let orgId = body.organization_id
  if (!orgId) {
    const { data: prof } = await service
      .from('user_profiles')
      .select('id')
      .eq('email', 'info@myaircraft.us')
      .single()
    if (prof) {
      const { data: m } = await service
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', prof.id)
        .single()
      orgId = m?.organization_id
    }
  }
  if (!orgId) return NextResponse.json({ error: 'Cannot resolve organization_id' }, { status: 500 })

  const t0 = Date.now()
  const parsed = await parseStructuredQuery({
    organizationId: orgId,
    aircraftId: body.aircraft_id,
    queryText: question,
  })
  const embeddingText = parsed.cleanedQuery || question
  const [emb] = await generateEmbeddings([{ id: 'q', text: embeddingText }])
  const chunks = await retrieveChunks({
    organizationId: orgId,
    aircraftId: parsed.aircraftId ?? body.aircraft_id,
    queryEmbedding: emb.embedding,
    queryText: embeddingText,
    docTypeFilter: parsed.docTypeFilter,
    limit: 20,
    parsedQuery: parsed,
  })
  const answer = await generateAnswer(question, chunks)
  const latencyMs = Date.now() - t0

  return NextResponse.json({
    question,
    aircraft_id: body.aircraft_id ?? null,
    answer: answer.answer,
    confidence: answer.confidence,
    chunks_retrieved: chunks.length,
    cited_chunks: answer.citedChunkIds.length,
    citations: answer.citations.map((c) => ({
      doc: c.documentTitle,
      page: c.pageNumber,
      snippet: (c.snippet ?? '').slice(0, 220),
    })),
    top_chunks: chunks.slice(0, 5).map((c) => ({
      doc: c.document_title,
      tail: c.aircraft_tail,
      page: c.page_number,
      score: Number(c.combined_score?.toFixed?.(3) ?? 0),
      preview: c.chunk_text.slice(0, 160),
    })),
    latency_ms: latencyMs,
    warnings: answer.warningFlags,
  })
}
