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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  const result = await checkCronHealth({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
