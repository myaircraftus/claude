/**
 * GET /api/cron/trial-conversion-coach — daily 10:00 UTC.
 *
 * Identifies orgs in their last 5 days of trial, scores conversion
 * likelihood from in-DB usage signals, suggests one outreach action
 * per org. Body returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { coachTrialConversion } from '@/lib/agents/impl/sales-trial-conversion-coach'
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
  const result = await coachTrialConversion({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned_orgs: result.output?.scanned_orgs ?? 0,
    outreach_count: result.output?.outreach_count ?? 0,
  })
}
