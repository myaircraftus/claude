/**
 * GET /api/cron/faa-bulletin-watcher — weekly Sun 06:00 UTC.
 *
 * Surfaces a manufacturer+model watch list so the founder can sweep
 * the FAA AD database for model-level airworthiness directives.
 * Counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { watchFaaBulletins } from '@/lib/agents/impl/safety-faa-bulletin-watcher'
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
  const result = await watchFaaBulletins({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    aircraft_scanned: result.output?.aircraft_scanned ?? 0,
    faa_lookups: result.output?.faa_lookups ?? 0,
    models_found: result.output?.models_found ?? 0,
  })
}
