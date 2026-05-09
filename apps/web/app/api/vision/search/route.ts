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
    return NextResponse.json({ error: message }, { status: 500 })
  }
  const elapsed_ms = Date.now() - t0

  return NextResponse.json({
    results,
    elapsed_ms,
    mode: mode ?? 'hybrid',
    org_id: membership.organization_id,
  })
}
