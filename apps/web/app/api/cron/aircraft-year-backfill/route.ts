/**
 * GET /api/cron/aircraft-year-backfill — weekly Sunday 05:00 UTC.
 *
 * For aircraft with year IS NULL, proposes a year from serial prefix
 * or earliest logbook entry. Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { backfillAircraftYears } from '@/lib/agents/impl/data-quality-aircraft-year-backfiller'
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
  const result = await backfillAircraftYears({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    proposal_count: result.output?.proposal_count ?? 0,
  })
}
