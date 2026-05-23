/**
 * GET /api/cron/orphaned-records — nightly 04:00 UTC.
 *
 * Hunts for rows pointing at deleted FK references across the
 * most-trafficked tables. Returns counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectOrphanedRecords } from '@/lib/agents/impl/data-quality-orphaned-records-detector'
import {
  isCronAuthorized,
  cronUnauthorizedResponse,
  cronAckResponse,
  cronErrorResponse,
} from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse()
  const service = createServiceSupabase()
  const result = await detectOrphanedRecords({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    scanned_tables: result.output?.scanned_tables ?? 0,
    total_orphans: result.output?.total_orphans ?? 0,
  })
}
