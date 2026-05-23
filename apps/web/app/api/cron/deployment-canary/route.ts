/**
 * GET /api/cron/deployment-canary — every 5 minutes.
 *
 * HTTP-probes a small set of public endpoints. Emits a
 * deployment_canary_failed recommendation on any probe failure.
 * Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runDeploymentCanary } from '@/lib/agents/impl/ops-deployment-canary'
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
  const result = await runDeploymentCanary({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    probe_count: result.output?.probe_count ?? 0,
    ok_count: result.output?.ok_count ?? 0,
    fail_count: result.output?.fail_count ?? 0,
  })
}
