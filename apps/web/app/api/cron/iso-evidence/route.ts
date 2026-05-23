/**
 * GET /api/cron/iso-evidence — quarterly (first of every quarter 00:30 UTC).
 *
 * Parallel ISO 27001 Annex-A control evidence packet. Returns summary.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { collectIsoEvidence } from '@/lib/agents/impl/compliance-iso-evidence-collector'
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
  const result = await collectIsoEvidence({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    quarter: result.output?.quarter ?? null,
    control_count: result.output?.controls.length ?? 0,
  })
}
