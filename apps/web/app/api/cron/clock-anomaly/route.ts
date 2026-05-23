/**
 * GET /api/cron/clock-anomaly — daily 06:00 UTC.
 *
 * Detects shift_too_long / open_shift / overlapping_shifts /
 * zero_hour_shift on time_clock_entries from the last 7 days.
 * Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectClockAnomalies } from '@/lib/agents/impl/workforce-clock-anomaly'
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
  const result = await detectClockAnomalies({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    anomaly_count: result.output?.anomaly_count ?? 0,
  })
}
