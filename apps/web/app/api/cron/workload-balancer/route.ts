/**
 * GET /api/cron/workload-balancer — daily 08:00 UTC.
 *
 * Detects mechanic workload imbalance per organization. Counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectWorkloadImbalance } from '@/lib/agents/impl/workforce-workload-balancer'
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
  const result = await detectWorkloadImbalance({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    organizations_scanned: result.output?.organizations_scanned ?? 0,
    imbalanced_count: result.output?.imbalanced_count ?? 0,
  })
}
