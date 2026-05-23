/**
 * GET /api/cron/cost-anomaly — daily at 09:00 UTC.
 *
 * Fires ops.cost-anomaly-detector. Founder reads the morning
 * recommendation row from /admin/agents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectCostAnomalies } from '@/lib/agents/impl/ops-cost-anomaly-detector'
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
  const result = await detectCostAnomalies({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
