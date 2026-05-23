/**
 * GET /api/cron/seo-suggester — weekly Mon 02:00 UTC.
 *
 * Recommends the next high-demand SEO blog post topics based on
 * /api/ask question volume + recurring inbox topics + AD numbers.
 * Body returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { suggestSeoTopics } from '@/lib/agents/impl/content-seo-suggester'
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
  const result = await suggestSeoTopics({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    ask_log_count: result.output?.ask_log_count ?? 0,
    inbox_message_count: result.output?.inbox_message_count ?? 0,
    gap_count: result.output?.gap_count ?? 0,
  })
}
