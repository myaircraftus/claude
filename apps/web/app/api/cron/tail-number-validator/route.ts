/**
 * GET /api/cron/tail-number-validator — weekly, Monday 05:00 UTC.
 *
 * Regex sweep of aircraft.tail_number. Emits tail_number_issues
 * recommendations into agent_runs for rows that don't match the
 * FAA N-number format. Body returns only counts — the full issue
 * list is in /admin/agents under admin auth.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { validateTailNumbers } from '@/lib/agents/impl/data-quality-tail-number-validator'
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
  // Default cron run includes the FAA registry cross-check at a bounded
  // budget (30 live lookups per run, cached for 12h in faa_registry_cache).
  // Disable via ?enrich=0 if a live deploy is flaky on the FAA side.
  const enrich = req.nextUrl.searchParams.get('enrich') !== '0'
  const service = createServiceSupabase()
  const result = await validateTailNumbers({
    supabase: service,
    enrichWithFaa: enrich,
  })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    invalid_count: result.output?.invalid_count ?? 0,
    faa_checked: result.output?.faa_checked ?? 0,
  })
}
