/**
 * GET /api/cron/soc2-evidence — quarterly (first of every quarter 00:00 UTC).
 *
 * Assembles the SOC2 evidence packet from in-DB signals. Returns
 * summary counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { collectSoc2Evidence } from '@/lib/agents/impl/compliance-soc2-evidence-collector'
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
  const result = await collectSoc2Evidence({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    quarter: result.output?.quarter ?? null,
    admin_count: result.output?.access_review.length ?? 0,
    deploy_count: result.output?.deploy_count ?? 0,
    incident_count: result.output?.incident_count ?? 0,
  })
}
