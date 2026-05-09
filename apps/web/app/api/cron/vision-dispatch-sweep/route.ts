/**
 * GET /api/cron/vision-dispatch-sweep  (Phase 8 Sprint 8.3)
 *
 * Every 10 minutes (per vercel.json): find vision_index_jobs that are
 * still 'queued' more than 1 minute after creation, and dispatch them.
 *
 * Iterates org-by-org so no single org can starve others by holding a
 * giant job-batch — limit per-org to 20 jobs per tick, anything beyond
 * gets the next tick.
 *
 * Mirrors the auth + structure of /api/cron/extract-receipts-sweep
 * (sprint 7.3 backstop pattern).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { sweepQueuedJobs } from '@/lib/vision/dispatcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isVercelCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCron(req)) return NextResponse.json({ error: 'Cron only' }, { status: 401 })

  const service = createServiceSupabase()

  // Find every org with at least one queued job older than 1 minute.
  const cutoff = new Date(Date.now() - 60_000).toISOString()
  const { data: queued, error } = await service
    .from('vision_index_jobs')
    .select('organization_id')
    .eq('status', 'queued')
    .lt('created_at', cutoff)
    .limit(500)
  if (error) {
    console.error('[cron/vision-dispatch-sweep] list error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orgsWithQueuedJobs = Array.from(new Set(
    (queued ?? []).map((r: { organization_id: string }) => r.organization_id),
  ))

  if (orgsWithQueuedJobs.length === 0) {
    return NextResponse.json({ ok: true, swept: 0, orgs_processed: 0 })
  }

  const perOrgResults: Array<{ org_id: string; swept: number; succeeded: number; failed: number }> = []

  for (const orgId of orgsWithQueuedJobs) {
    try {
      const r = await sweepQueuedJobs(service, orgId)
      perOrgResults.push({
        org_id: orgId,
        swept: r.swept,
        succeeded: r.results.filter((x) => x.status === 'completed').length,
        failed: r.results.filter((x) => x.status === 'failed').length,
      })
    } catch (err) {
      console.warn(`[cron/vision-dispatch-sweep] org ${orgId} failed`, err)
      perOrgResults.push({ org_id: orgId, swept: 0, succeeded: 0, failed: 0 })
    }
  }

  const totalSwept = perOrgResults.reduce((s, r) => s + r.swept, 0)
  return NextResponse.json({
    ok: true,
    swept: totalSwept,
    orgs_processed: perOrgResults.length,
    per_org: perOrgResults,
  })
}
