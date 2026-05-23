/**
 * GET /api/cron/stripe-failed-charges — hourly :30.
 *
 * Body returns counts only — never the customer-id / org list. Detail
 * is in agent_runs surfaced in /admin/agents under admin auth.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { watchStripeFailedCharges } from '@/lib/agents/impl/ops-stripe-failed-charge-watcher'
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
  const result = await watchStripeFailedCharges({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned_charges: result.output?.scanned_charges ?? 0,
    cluster_count: result.output?.cluster_count ?? 0,
  })
}
