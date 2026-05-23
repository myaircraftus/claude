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

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
  const userIdFilter = req.nextUrl.searchParams.get('user_id') ?? undefined
  const service = createServiceSupabase()
  const result = await syncTachTime({ supabase: service, userId: userIdFilter })
  return NextResponse.json({
    ok: result.ok,
    run_id: result.runId,
    ...(result.output ?? {}),
  })
}
