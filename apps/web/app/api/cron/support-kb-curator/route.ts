/**
 * /api/cron/support-kb-curator — runs the kb-curator agent.
 *
 * Scans the last 30 days of first-responder runs for clusters of
 * low-confidence questions and drafts new KB entries. Admin reviews
 * the drafts (status='draft' is admin-only via RLS) and publishes
 * via /admin/support/kb.
 *
 * Schedule (per lib/agents/registry.ts): 04:00 UTC daily.
 *
 * Auth: same pattern as /api/cron/support-triage.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { curateKbDrafts } from '@/lib/agents/impl/support-kb-curator'

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
  const minCluster = Math.max(
    2,
    Math.min(20, Number(req.nextUrl.searchParams.get('min_cluster') ?? 3)),
  )
  const daysBack = Math.max(
    1,
    Math.min(90, Number(req.nextUrl.searchParams.get('days_back') ?? 30)),
  )
  const service = createServiceSupabase()
  const result = await curateKbDrafts({
    supabase: service,
    minClusterSize: minCluster,
    daysBack,
  })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'kb-curator failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({
    ok: true,
    run_id: result.runId,
    ...(result.output ?? {}),
  })
}
