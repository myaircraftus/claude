/**
 * /api/cron/health-alerts — Phase 16 Sprint 16.6
 *
 * Periodic system-health probe. Fires alert_events when:
 *   - Any vision worker hasn't heartbeat in 5 minutes (P1).
 *   - Queue depth > 100 jobs (P1).
 *   - Today's spend > 3x trailing-30d avg (P0).
 *   - Failed-job burst > 10 failures/hour (P1).
 *
 * Also rolls up today's cost snapshots so the dashboard has fresh data.
 *
 * Auth: Vercel Cron header OR CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { rollUpDay, checkCostSpike } from '@/lib/ops/cost-tracker'

export const dynamic = 'force-dynamic'

const WORKER_STALE_MIN = 5
const QUEUE_DEPTH_THRESHOLD = 100
const FAILED_JOB_BURST_THRESHOLD = 10

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const presented =
    req.nextUrl.searchParams.get('secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return presented === expected
}

interface AlertCheckResult {
  alert_type: 'worker_stale' | 'queue_depth' | 'cost_spike' | 'failed_job_burst' | 'error_rate_spike' | 'churn_burst' | 'other'
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  summary: string
  metadata: Record<string, unknown>
}

async function checkWorkerStale(supabase: any): Promise<AlertCheckResult | null> {
  const cutoff = new Date(Date.now() - WORKER_STALE_MIN * 60_000).toISOString()
  // Active workers (status != 'stopping') that haven't heartbeat recently.
  const { data, error } = await supabase
    .from('vision_worker_heartbeat')
    .select('worker_id, gpu_host, last_seen_at, status')
    .neq('status', 'stopping')
    .lt('last_seen_at', cutoff)
  if (error) return null
  const stale = (data ?? []) as Array<{ worker_id: string; gpu_host: string; last_seen_at: string; status: string }>
  if (stale.length === 0) return null
  return {
    alert_type: 'worker_stale',
    severity: 'P1',
    summary: `${stale.length} vision worker(s) stale: ${stale.slice(0, 3).map((w) => `${w.worker_id} (${w.gpu_host})`).join(', ')}`,
    metadata: { workers: stale, threshold_min: WORKER_STALE_MIN },
  }
}

async function checkQueueDepth(supabase: any): Promise<AlertCheckResult | null> {
  const { count, error } = await supabase
    .from('vision_index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
  if (error) return null
  if ((count ?? 0) <= QUEUE_DEPTH_THRESHOLD) return null
  return {
    alert_type: 'queue_depth',
    severity: 'P1',
    summary: `Vision queue depth ${count} (threshold ${QUEUE_DEPTH_THRESHOLD})`,
    metadata: { queued_jobs: count, threshold: QUEUE_DEPTH_THRESHOLD },
  }
}

async function checkFailedBurst(supabase: any): Promise<AlertCheckResult | null> {
  const cutoff = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count, error } = await supabase
    .from('vision_index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('updated_at', cutoff)
  if (error) return null
  if ((count ?? 0) <= FAILED_JOB_BURST_THRESHOLD) return null
  return {
    alert_type: 'failed_job_burst',
    severity: 'P1',
    summary: `${count} vision jobs failed in the last hour (threshold ${FAILED_JOB_BURST_THRESHOLD})`,
    metadata: { failed_jobs: count, window_min: 60, threshold: FAILED_JOB_BURST_THRESHOLD },
  }
}

async function checkCostSpikeAlert(supabase: any): Promise<AlertCheckResult | null> {
  try {
    const r = await checkCostSpike(supabase)
    if (!r.spike) return null
    return {
      alert_type: 'cost_spike',
      severity: 'P0',
      summary: `Cost spike: today $${(r.today_cents / 100).toFixed(2)} vs 30d avg $${(r.trailing_30d_avg_cents / 100).toFixed(2)}`,
      metadata: r,
    }
  } catch {
    return null
  }
}

async function fireAlertIfNew(supabase: any, alert: AlertCheckResult): Promise<boolean> {
  // Single-fire guard: don't insert if an identical-type firing alert
  // already exists in the last hour.
  const cutoff = new Date(Date.now() - 60 * 60_000).toISOString()
  const { data: existing } = await supabase
    .from('alert_events')
    .select('id')
    .eq('alert_type', alert.alert_type)
    .eq('status', 'firing')
    .gte('fired_at', cutoff)
    .limit(1)
    .maybeSingle()
  if (existing) return false

  await supabase.from('alert_events').insert({
    alert_type: alert.alert_type,
    severity: alert.severity,
    summary: alert.summary,
    metadata: alert.metadata,
    status: 'firing',
  })
  return true
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceSupabase()

  // 1. Roll up today's cost snapshots (idempotent — UNIQUE on date + source).
  let costRollup: Awaited<ReturnType<typeof rollUpDay>> | { error: string }
  try {
    costRollup = await rollUpDay(service, new Date())
  } catch (e) {
    costRollup = { error: e instanceof Error ? e.message : String(e) }
  }

  // 2. Run all alert checks.
  const checks = await Promise.all([
    checkWorkerStale(service),
    checkQueueDepth(service),
    checkFailedBurst(service),
    checkCostSpikeAlert(service),
  ])
  const fireResults: Array<{ alert_type: string; fired: boolean }> = []
  for (const c of checks) {
    if (!c) continue
    const fired = await fireAlertIfNew(service, c)
    fireResults.push({ alert_type: c.alert_type, fired })
  }

  return NextResponse.json({
    ok: true,
    cost_rollup: costRollup,
    checks: fireResults,
  })
}
