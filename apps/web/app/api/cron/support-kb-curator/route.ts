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
