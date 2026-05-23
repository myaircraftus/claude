/**
 * GET /api/cron/billing-lifecycle — daily 03:00 UTC.
 *
 * Expires past-valid estimates, marks overdue invoices, auto-pays
 * fully-paid invoices. Counts only.
 */
import { NextRequest } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runBillingLifecycle } from '@/lib/agents/impl/finance-billing-lifecycle'
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
  const result = await runBillingLifecycle({ supabase: service })
  if (!result.ok) return cronErrorResponse(result.error ?? 'agent failed', result.runId)
  return cronAckResponse({
    run_id: result.runId,
    estimates_expired: result.output?.estimates_expired ?? 0,
    invoices_marked_overdue: result.output?.invoices_marked_overdue ?? 0,
    invoices_marked_paid: result.output?.invoices_marked_paid ?? 0,
  })
}
