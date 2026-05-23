/**
 * GET /api/cron/tach-time-sync — daily browser-automation tach-time sync.
 *
 * Walks every external_system_credentials row, decrypts the password
 * in-memory, runs the per-vendor scraper, and emits recommendation
 * rows for deltas / proposed new aircraft. Owner/admin reviews from
 * /admin/agents.
 *
 * Schedule: 0 6 * * * (06:00 UTC daily) — see vercel.json.
 * Auth: shared CRON_SECRET, same as the other cron routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { syncTachTime } from '@/lib/agents/impl/data-sync-tach-time-scraper'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userIdFilter = req.nextUrl.searchParams.get('user_id') ?? undefined
  const service = createServiceSupabase()
  const result = await syncTachTime({ supabase: service, userId: userIdFilter })
  return NextResponse.json({
    ok: result.ok,
    run_id: result.runId,
    ...(result.output ?? {}),
  })
}
