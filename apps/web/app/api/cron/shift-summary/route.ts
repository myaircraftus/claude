/**
 * GET /api/cron/shift-summary — daily, 17:00 UTC.
 *
 * Drafts shift summaries. Body returns counts only; per-mechanic
 * detail is in agent_runs under admin auth.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { draftShiftSummaries } from '@/lib/agents/impl/workforce-shift-summary-drafter'
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
  const result = await draftShiftSummaries({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    mechanic_count: result.output?.mechanic_count ?? 0,
  })
}
