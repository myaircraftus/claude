/**
 * GET /api/cron/cron-health — schedule: every 30 minutes.
 *
 * Pings ops.cron-health to verify every active cron agent ran in the
 * last 24h-ish window. Misses surface as a recommendation row that the
 * /admin/agents page renders.
 *
 * Same shared-secret auth as the other cron routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { checkCronHealth } from '@/lib/agents/impl/ops-cron-health'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await checkCronHealth({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
