/**
 * GET /api/cron/pii-leak-scanner — hourly.
 *
 * Body returns counts only. The scanner deliberately stores only a
 * redacted preview in agent_runs (kind + last-4 digits), but we still
 * MUST NOT echo even those previews in the cron route body — combined
 * with any future auth misconfig that would leak a multi-tenant
 * snapshot.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { scanForPiiLeaks } from '@/lib/agents/impl/safety-pii-leak-scanner'
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
  const result = await scanForPiiLeaks({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned_inbox: result.output?.scanned_inbox ?? 0,
    scanned_ask: result.output?.scanned_ask ?? 0,
    hit_count: result.output?.hit_count ?? 0,
  })
}
