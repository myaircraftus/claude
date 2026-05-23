/**
 * GET /api/cron/rerank-cache-warmer — every 6 hours.
 *
 * Warms the Cohere rerank LRU cache by replaying top-100 questions
 * from the last 14 days. No-ops if COHERE_API_KEY is unset.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { warmRerankCache } from '@/lib/agents/impl/rag-rerank-cache-warmer'
import {
  isCronAuthorized,
  cronUnauthorizedResponse,
  cronAckResponse,
  cronErrorResponse,
} from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse()
  const service = createServiceSupabase()
  const result = await warmRerankCache({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    enabled: result.output?.enabled ?? false,
    questions_warmed: result.output?.questions_warmed ?? 0,
    cohere_ok: result.output?.cohere_ok ?? 0,
    errors: result.output?.errors ?? 0,
  })
}
