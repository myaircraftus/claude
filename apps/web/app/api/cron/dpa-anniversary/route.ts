/**
 * GET /api/cron/dpa-anniversary — daily 09:00 UTC.
 *
 * 30 / 7 / 0 / overdue notifications for DPA re-review anniversaries.
 * Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { reviewDpaAnniversaries } from '@/lib/agents/impl/compliance-dpa-anniversary-reviewer'
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
  const result = await reviewDpaAnniversaries({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    due_count: result.output?.due_count ?? 0,
  })
}
