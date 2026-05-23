/**
 * GET /api/cron/ad-reference-extractor — daily at 05:30 UTC.
 *
 * Regex-extracts AD / SB / SL references from logbook_entries.narrative
 * when the structured ad_reference column is null. Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { extractAdReferences } from '@/lib/agents/impl/data-quality-ad-reference-extractor'
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
  const result = await extractAdReferences({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned: result.output?.scanned ?? 0,
    promotion_count: result.output?.promotion_count ?? 0,
  })
}
