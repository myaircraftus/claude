/**
 * GET /api/cron/review-request-timer — daily 11:00 UTC.
 *
 * Identifies "ready to ask for a review" customers. Returns counts.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { findReviewRequestCandidates } from '@/lib/agents/impl/sales-review-request-timer'
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
  const result = await findReviewRequestCandidates({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    candidate_count: result.output?.candidate_count ?? 0,
  })
}
