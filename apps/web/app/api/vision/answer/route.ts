/**
 * POST /api/vision/answer  (Phase 8 Sprint 8.6)
 *
 * Body: { query, k?, force_fallback? }
 *
 * Runs hybridRetrieve, then conditionally invokes the OpenAI Vision
 * fallback when:
 *   - force_fallback=true, OR
 *   - top result's score_combined < VISION_FALLBACK_THRESHOLD (0.3 default)
 *
 * Returns:
 *   {
 *     answer: string,         // either the model's answer OR a "no fallback used" stub
 *     confidence: number,     // 0-1
 *     citations: number[],    // page numbers cited
 *     fallback_used: boolean,
 *     retrieval_results: HybridResult[],
 *     elapsed_ms: number,
 *   }
 *
 * Auth: standard session, all personas.
 * Rate limit: 10 req/min/IP — heavier than /search (30/min) since
 * a fallback call burns OpenAI tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation/common'
import { hybridRetrieve, type HybridResult } from '@/lib/vision/retriever'
import {
  openAiVisionAnswer,
  readFallbackThreshold,
  FALLBACK_MAX_PAGES,
} from '@/lib/vision/openai-fallback'
import { getVisionPage } from '@/lib/vision/registry'
import { enqueueLowConfidence } from '@/lib/vision/review-queue'
import { logRetrieval, calibrateForLogging } from '@/lib/vision/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).optional(),
  force_fallback: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit(`vision-answer:${getClientIp(req.headers)}`, {
    limit: 10, windowSeconds: 60,
  })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response
  const { query, k, force_fallback } = parsed.data

  const service = createServiceSupabase()
  const t0 = Date.now()

  // Step 1: hybrid retrieve
  let results: HybridResult[]
  try {
    results = await hybridRetrieve(service, membership.organization_id, query, { k })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `retrieve failed: ${message}` }, { status: 500 })
  }

  // Step 2: decide fallback
  const threshold = readFallbackThreshold()
  const topScore = results[0]?.score_combined ?? 0
  const shouldFallback = force_fallback === true || (results.length > 0 && topScore < threshold)

  let fallbackResult: { answer: string; confidence: number; citations: number[]; fallback_used: boolean; model: string } = {
    answer: results.length === 0
      ? 'No matches found in either text or vision retrieval.'
      : `Top match: page ${results[0].page_number} of doc ${results[0].source_document_id} (combined score ${topScore.toFixed(3)}). Snippet: ${results[0].snippet}`,
    confidence: topScore,
    citations: results.length === 0 ? [] : [results[0].page_number],
    fallback_used: false,
    model: 'retrieval-only',
  }

  if (shouldFallback && results.length > 0) {
    // Resolve top-N candidates back to vision_pages rows so the
    // fallback can build its image array.
    const topN = results.slice(0, FALLBACK_MAX_PAGES)
    const pages: any[] = []
    for (const r of topN) {
      // r doesn't carry the vision_page_id directly — fetch by
      // (org, source_document_id, page_number) via vision_pages.
      const { data, error } = await service
        .from('vision_pages')
        .select('*')
        .eq('organization_id', membership.organization_id)
        .eq('source_document_id', r.source_document_id)
        .eq('page_number', r.page_number)
        .is('deleted_at', null)
        .maybeSingle()
      if (!error && data) pages.push(data)
    }

    if (pages.length > 0) {
      // Sprint 8.7 — auto-enqueue the top page for human review.
      // Best-effort; failure logs but doesn't block the answer.
      try {
        await enqueueLowConfidence(service, {
          organizationId: membership.organization_id,
          visionPageId: pages[0].id,
          searchQuery: query,
          confidenceScore: topScore,
        })
      } catch {
        // already swallowed inside enqueueLowConfidence
      }

      try {
        const f = await openAiVisionAnswer(service, {
          organizationId: membership.organization_id,
          userId: user.id,
          query,
          candidatePages: pages,
        })
        fallbackResult = {
          answer: f.answer,
          confidence: f.confidence,
          citations: f.citations,
          fallback_used: f.invoked,
          model: f.model,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Don't fail the whole call — return retrieval results + flag the fallback failure.
        fallbackResult = {
          answer: `Fallback attempted but failed: ${message}`,
          confidence: topScore,
          citations: results.slice(0, 1).map((r) => r.page_number),
          fallback_used: false,
          model: 'fallback-error',
        }
      }
    }
  }

  const total_ms = Date.now() - t0

  // Telemetry — fire-and-forget. Calibrate against the top retrieval
  // page so /admin/vision/telemetry can show drift over time.
  const top = results[0]
  let raw_confidence: number | null = null
  let calibrated_confidence: number | null = null
  let topVisionPageId: string | null = null
  if (top) {
    raw_confidence = top.score_combined
    const { data: page } = await service
      .from('vision_pages')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('source_document_id', top.source_document_id)
      .eq('page_number', top.page_number)
      .is('deleted_at', null)
      .maybeSingle()
    topVisionPageId = (page as any)?.id ?? null
    const fallbackCitedTopPage =
      fallbackResult.fallback_used &&
      fallbackResult.citations.includes(top.page_number)
    const { calibrated } = await calibrateForLogging(service, {
      organizationId: membership.organization_id,
      searchQuery: query,
      visionPageId: topVisionPageId,
      rawScore: top.score_combined,
      fallbackCitedTopPage,
    })
    calibrated_confidence = calibrated
  }

  void logRetrieval(service, {
    organization_id: membership.organization_id,
    user_id: user.id,
    route: 'answer',
    mode: 'hybrid',
    search_query: query,
    result_count: results.length,
    top_combined_score: top?.score_combined ?? null,
    raw_confidence,
    calibrated_confidence,
    fallback_invoked: fallbackResult.fallback_used,
    fallback_model: fallbackResult.fallback_used ? fallbackResult.model : null,
    fallback_citations: fallbackResult.fallback_used ? fallbackResult.citations.length : null,
    total_ms,
  })

  return NextResponse.json({
    answer: fallbackResult.answer,
    confidence: fallbackResult.confidence,
    citations: fallbackResult.citations,
    fallback_used: fallbackResult.fallback_used,
    model: fallbackResult.model,
    threshold,
    retrieval_results: results,
    elapsed_ms: total_ms,
    raw_confidence,
    calibrated_confidence,
  })
}
