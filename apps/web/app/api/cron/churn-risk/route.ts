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

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const presented =
    req.nextUrl.searchParams.get('secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return presented === expected
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await predictChurnRisk({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
