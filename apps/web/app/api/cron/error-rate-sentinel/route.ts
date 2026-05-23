/**
 * GET /api/cron/error-rate-sentinel — hourly.
 *
 * Detects spikes in agent_runs failures or open P0/P1 alerts.
 * Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { checkErrorRate } from '@/lib/agents/impl/ops-error-rate-sentinel'
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
  const result = await checkErrorRate({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    failures_last_hour: result.output?.failures_last_hour ?? 0,
    ratio: result.output?.ratio ?? 0,
    p0_alerts: result.output?.p0_alerts ?? 0,
    p1_alerts: result.output?.p1_alerts ?? 0,
    spike: result.output?.spike ?? false,
  })
}
