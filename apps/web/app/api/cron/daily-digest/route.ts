/**
 * GET /api/cron/daily-digest — daily 07:00 UTC.
 *
 * Founder morning brief aggregating yesterday's open recommendations
 * across the whole agent fleet. Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { buildDailyDigest } from '@/lib/agents/impl/ops-daily-digest'
import {
  isCronAuthorized,
  cronUnauthorizedResponse,
  cronAckResponse,
  cronErrorResponse,
} from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse()
  const service = createServiceSupabase()
  const result = await buildDailyDigest({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    total_open: result.output?.total_open_recommendations ?? 0,
    critical_count: result.output?.critical_count ?? 0,
    routine_count: result.output?.routine_count ?? 0,
  })
}
