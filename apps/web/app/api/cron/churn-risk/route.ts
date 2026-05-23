/**
 * GET /api/cron/churn-risk — daily at 06:30 UTC.
 *
 * Fires sales.churn-risk-predictor to score every org for churn risk.
 * Top-decile risks land as a 'churn_risk_review' recommendation row
 * the founder reads each morning.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { predictChurnRisk } from '@/lib/agents/impl/sales-churn-risk-predictor'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 120


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await predictChurnRisk({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
