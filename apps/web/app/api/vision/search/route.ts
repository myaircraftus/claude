/**
 * POST /api/vision/search  (Phase 8 Sprint 8.5)
 *
 * Body: { query: string, k?: number, mode?: 'hybrid' | 'text' | 'vision' }
 *
 * Single retrieval entry-point — combines existing text RAG (read-only
 * call into /lib/rag) with ColQwen2/ColPali vision late-interaction
 * via MaxSim. Returns top-k hits with text/vision/combined scores.
 *
 * Auth: standard session, all personas.
 * Rate limit: 30 req/min/IP (search is the hot path; tighter than
 * the 10/min on /api/vision/answer where a model call is involved).
 *
 * Embedding strategy this sprint:
 *   For mode='hybrid' and 'text', the route uses a deterministic
 *   stub for the text query embedding (via stubTextQueryEmbedding).
 *   When the existing OCR/RAG embedder is wired up at the API layer
 *   in a future sprint, this route will swap to the real OpenAI call
 *   without any change to hybridRetrieve's signature.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation/common'
import { hybridRetrieve, type HybridMode } from '@/lib/vision/retriever'
import { logRetrieval, calibrateForLogging } from '@/lib/vision/telemetry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const Body = z.object({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).optional(),
  mode: z.enum(['hybrid', 'text', 'vision']).optional(),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit(`vision-search:${getClientIp(req.headers)}`, {
    limit: 30,
    windowSeconds: 60,
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
  const { query, k, mode } = parsed.data

  // Use service-role for the retrieval reads — RLS would constantly
  // re-check membership for every getPatchVectors call. Org isolation
  // is enforced explicitly via the orgId arg into hybridRetrieve.
  const service = createServiceSupabase()

  const t0 = Date.now()
  let results
  try {
    results = await hybridRetrieve(service, membership.organization_id, query, {
      k,
      mode: (mode ?? 'hybrid') as HybridMode,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[vision/search] hybridRetrieve failed:', message)
    // Best-effort telemetry on the failure path too.
    void logRetrieval(service, {
      organization_id: membership.organization_id,
      user_id: user.id,
      route: 'search',
      mode: (mode ?? 'hybrid') as HybridMode,
      search_query: query,
      result_count: 0,
      total_ms: Date.now() - t0,
      status: 'error',
      error_message: message,
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const elapsed_ms = Date.now() - t0

  // Resolve calibration for the top hit (if any) and log telemetry.
  // Fire-and-forget — never blocks the response.
  const top = results[0]
  let raw_confidence: number | null = null
  let calibrated_confidence: number | null = null
  let topVisionPageId: string | null = null
  if (top) {
    raw_confidence = top.score_combined
    // Resolve top page id from (org, doc, page_number) so the calibrator
    // can read review-queue + feedback signals.
    const { data: page } = await service
      .from('vision_pages')
      .select('id')
      .eq('organization_id', membership.organization_id)
      .eq('source_document_id', top.source_document_id)
      .eq('page_number', top.page_number)
      .is('deleted_at', null)
      .maybeSingle()
    topVisionPageId = (page as any)?.id ?? null
    const { calibrated } = await calibrateForLogging(service, {
      organizationId: membership.organization_id,
      searchQuery: query,
      visionPageId: topVisionPageId,
      rawScore: top.score_combined,
    })
    calibrated_confidence = calibrated
  }

  void logRetrieval(service, {
    organization_id: membership.organization_id,
    user_id: user.id,
    route: 'search',
    mode: (mode ?? 'hybrid') as HybridMode,
    search_query: query,
    result_count: results.length,
    top_combined_score: top?.score_combined ?? null,
    raw_confidence,
    calibrated_confidence,
    retrieval_ms: elapsed_ms,
    total_ms: elapsed_ms,
  })

  return NextResponse.json({
    results,
    elapsed_ms,
    mode: mode ?? 'hybrid',
    org_id: membership.organization_id,
    raw_confidence,
    calibrated_confidence,
  })
}
