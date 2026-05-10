/**
 * /admin/health — Phase 16 Sprint 16.6 system health dashboard.
 *
 * Four sections:
 *   - Worker: vision_worker_heartbeat — host, last seen, status,
 *     jobs processed.
 *   - Queue: vision_index_jobs grouped by status + oldest job age.
 *   - Cost: trailing-7-day spend per source from cost_snapshots.
 *   - Customer signals: total active orgs, tier distribution, open
 *     churn signals, trailing-30d NPS.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { readTrailing, checkCostSpike, type CostSnapshot } from '@/lib/ops/cost-tracker'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Health' }

const WORKER_STALE_MIN = 5

interface WorkerRow {
  worker_id: string
  gpu_host: string
  last_seen_at: string
  status: string
  jobs_processed_total: number
  last_error: string | null
}

interface QueueBucket { status: string; n: number }

function ageMs(iso: string): number { return Date.now() - new Date(iso).getTime() }
function fmtAge(ms: number): string {
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m}m`
  if (m < 60 * 24) return `${Math.round(m / 60)}h`
  return `${Math.round(m / (60 * 24))}d`
}

export default async function AdminHealthPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()

  // Worker heartbeat — most recent per worker_id.
  const { data: workersRaw } = await service
    .from('vision_worker_heartbeat')
    .select('worker_id, gpu_host, last_seen_at, status, jobs_processed_total, last_error')
    .order('last_seen_at', { ascending: false })
    .limit(50)
  const workers = ((workersRaw ?? []) as WorkerRow[])

  // Queue counts by status.
  const { data: jobsRaw } = await service
    .from('vision_index_jobs')
    .select('status')
  const queueBuckets: QueueBucket[] = (() => {
    const map = new Map<string, number>()
    for (const r of (jobsRaw ?? []) as Array<{ status: string }>) {
      map.set(r.status, (map.get(r.status) ?? 0) + 1)
    }
    return [...map.entries()].map(([status, n]) => ({ status, n })).sort((a, b) => b.n - a.n)
  })()

  // Oldest queued job.
  const { data: oldestQueued } = await service
    .from('vision_index_jobs')
    .select('id, scheduled_for, created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Trailing-7d cost snapshots.
  let snapshots: CostSnapshot[] = []
  try {
    snapshots = await readTrailing(service, 7)
  } catch { /* cost_snapshots may not be applied yet */ }
  const costByDay = new Map<string, Record<string, number>>()
  for (const s of snapshots) {
    const day = costByDay.get(s.snapshot_date) ?? {}
    day[s.source] = (day[s.source] ?? 0) + s.spend_cents
    costByDay.set(s.snapshot_date, day)
  }
  const costDays = [...costByDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  // Cost spike check (today vs 30d avg).
  let spike: Awaited<ReturnType<typeof checkCostSpike>> | null = null
  try {
    spike = await checkCostSpike(service)
  } catch { /* tolerate missing snapshots */ }

  // Customer signals.
  const { count: activeOrgs } = await service
    .from('organizations')
    .select('id', { count: 'exact', head: true })
  const { data: tierRaw } = await service
    .from('organizations')
    .select('tier')
  const tierBuckets: Record<string, number> = {}
  for (const r of (tierRaw ?? []) as Array<{ tier: string | null }>) {
    const t = r.tier ?? 'beta'
    tierBuckets[t] = (tierBuckets[t] ?? 0) + 1
  }
  let openChurn = 0
  try {
    const { count } = await service
      .from('churn_signals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    openChurn = count ?? 0
  } catch { /* tolerate */ }

  // Trailing 30d NPS.
  let npsAvg: number | null = null
  let npsCount = 0
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
    const { data: nps } = await service
      .from('feedback_items')
      .select('score')
      .eq('type', 'nps')
      .gte('created_at', cutoff)
    const rows = (nps ?? []) as Array<{ score: number | null }>
    const valid = rows.filter((r) => r.score != null) as Array<{ score: number }>
    npsCount = valid.length
    if (valid.length > 0) {
      const promoters = valid.filter((r) => r.score >= 9).length
      const detractors = valid.filter((r) => r.score <= 6).length
      npsAvg = Math.round(((promoters - detractors) / valid.length) * 100)
    }
  } catch { /* tolerate */ }

  const staleWorkers = workers.filter((w) => w.status !== 'stopping' && ageMs(w.last_seen_at) > WORKER_STALE_MIN * 60_000)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Health' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>System health</h1>
            <p className="text-sm text-muted-foreground">
              Vision workers, queue, cost, customer signals — all in one view.
            </p>
          </div>

          {/* Worker section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vision workers ({workers.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {staleWorkers.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  ⚠ {staleWorkers.length} worker(s) haven&rsquo;t heartbeat in {'>'}{WORKER_STALE_MIN}m
                </div>
              )}
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workers have registered.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left px-3 py-2">Worker</th>
                      <th className="text-left px-3 py-2">Host</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Last seen</th>
                      <th className="text-left px-3 py-2">Jobs total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((w) => {
                      const stale = w.status !== 'stopping' && ageMs(w.last_seen_at) > WORKER_STALE_MIN * 60_000
                      return (
                        <tr key={w.worker_id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono text-[12px]">{w.worker_id}</td>
                          <td className="px-3 py-2 text-muted-foreground">{w.gpu_host}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-md border px-2 py-0.5 text-[11px] ${
                              w.status === 'busy' ? 'bg-blue-50 text-blue-900 border-blue-200' :
                              w.status === 'idle' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
                              'bg-slate-50 text-slate-700 border-slate-200'
                            }`}>{w.status}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {fmtAge(ageMs(w.last_seen_at))} ago{stale ? ' ⚠' : ''}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px]">{w.jobs_processed_total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Queue section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vision job queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {queueBuckets.map((q) => (
                  <div key={q.status} className="rounded-lg border border-border bg-white p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{q.status}</p>
                    <p className="text-2xl font-mono">{q.n}</p>
                  </div>
                ))}
              </div>
              {oldestQueued && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Oldest queued job: {fmtAge(ageMs((oldestQueued as { created_at: string }).created_at))} old
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cost section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cost — trailing 7 days</CardTitle>
            </CardHeader>
            <CardContent>
              {spike?.spike && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-3 text-sm text-red-900">
                  ⚠ Cost spike: today ${(spike.today_cents / 100).toFixed(2)} vs 30d avg ${(spike.trailing_30d_avg_cents / 100).toFixed(2)}
                </div>
              )}
              {snapshots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No cost snapshots yet. Run /api/cron/health-alerts to roll up today&rsquo;s spend (cron schedule */5 * * * *).
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Anthropic</th>
                      <th className="text-right px-3 py-2">Modal</th>
                      <th className="text-right px-3 py-2">Stripe</th>
                      <th className="text-right px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costDays.map(([day, byMap]) => {
                      const total = Object.values(byMap).reduce((acc, v) => acc + v, 0)
                      return (
                        <tr key={day} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 font-mono">{day}</td>
                          <td className="px-3 py-2 text-right font-mono">${((byMap.anthropic ?? 0) / 100).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">${((byMap.modal ?? 0) / 100).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono">${((byMap.stripe ?? 0) / 100).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">${(total / 100).toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Customer signals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Active orgs</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-mono">{activeOrgs ?? 0}</p>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {Object.entries(tierBuckets).map(([t, n]) => (
                    <p key={t}>{t}: <span className="font-mono">{n}</span></p>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Open churn signals</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-mono">{openChurn}</p>
                <Link href="/admin/customer-signals" className="text-xs text-primary hover:underline">View signals →</Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">NPS (30d)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-3xl font-mono">{npsAvg ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{npsCount} responses</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
