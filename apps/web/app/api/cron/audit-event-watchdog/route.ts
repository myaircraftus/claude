/**
 * GET /api/cron/audit-event-watchdog — hourly.
 *
 * Integrity check on the audit_event chain. Returns counts only;
 * the detailed finding list is in agent_runs under admin auth.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { watchAuditChain } from '@/lib/agents/impl/compliance-audit-event-watchdog'
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
  const result = await watchAuditChain({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    finding_count: result.output?.finding_count ?? 0,
    last_event_at: result.output?.last_event_at ?? null,
  })
}
