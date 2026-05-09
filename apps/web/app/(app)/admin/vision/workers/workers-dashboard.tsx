'use client'

/**
 * Sprint 11.4 — Workers dashboard client.
 *
 * Renders heartbeat rows, job-status histogram, stuck-job counts, and
 * the last 10 fallback dispatches. Auto-refreshes every 30s by
 * triggering a soft router refresh.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Heartbeat {
  worker_id: string
  gpu_host: string
  status: string
  last_seen_at: string
  jobs_processed_total: number
  last_job_id: string | null
  last_error: string | null
}

interface FallbackJob {
  status: string
  gpu_host: string
  created_at: string
  started_at: string | null
}

interface Props {
  heartbeats: Heartbeat[]
  jobStatusCounts: Record<string, number>
  stuckQueued: number
  stuckRunning: number
  recentFallbacks: FallbackJob[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'in future'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function isAlive(hb: Heartbeat): boolean {
  if (hb.status === 'stopping') return false
  return Date.now() - new Date(hb.last_seen_at).getTime() < 60_000
}

export function WorkersDashboard({
  heartbeats,
  jobStatusCounts,
  stuckQueued,
  stuckRunning,
  recentFallbacks,
}: Props) {
  const router = useRouter()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
      setTick((t) => t + 1)
    }, 30_000)
    return () => clearInterval(id)
  }, [router])

  const aliveCount = heartbeats.filter(isAlive).length
  const stuckTotal = stuckQueued + stuckRunning

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Vision Workers
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Phase 11 hybrid dispatch monitor. Colab Pro is the primary path; Modal fallback
            picks up stuck jobs every 5 min via cron. Page auto-refreshes every 30s.
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground">refresh #{tick}</div>
      </div>

      {/* Top-line counters */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Alive workers" value={aliveCount.toString()} tone={aliveCount > 0 ? 'good' : 'warn'} />
        <Stat label="Stuck >10m queued" value={stuckQueued.toString()} tone={stuckQueued === 0 ? 'good' : 'warn'} />
        <Stat label="Stuck >20m running" value={stuckRunning.toString()} tone={stuckRunning === 0 ? 'good' : 'warn'} />
        <Stat label="Total stuck" value={stuckTotal.toString()} tone={stuckTotal === 0 ? 'good' : 'warn'} />
      </section>

      {/* Heartbeats */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
          Worker heartbeats (last 50)
        </h2>
        {heartbeats.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No heartbeats yet. Migration 102 may not be applied — run{' '}
            <code className="font-mono text-[11px]">apps/web/scripts/apply-102.ts</code>.
            After that, start the Colab queue worker (see runbook
            <code className="font-mono text-[11px]"> /docs/runbooks/colab-queue-worker.md</code>).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/15 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Worker ID</th>
                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Host</th>
                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Status</th>
                  <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Last seen</th>
                  <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Jobs total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {heartbeats.map((hb) => {
                  const alive = isAlive(hb)
                  return (
                    <tr key={hb.worker_id} className={alive ? '' : 'opacity-60'}>
                      <td className="px-3 py-1.5 font-mono text-[11px]">{hb.worker_id}</td>
                      <td className="px-3 py-1.5">{hb.gpu_host}</td>
                      <td className="px-3 py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] ${
                          alive
                            ? hb.status === 'busy' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                            : hb.status === 'stopping' ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {alive ? hb.status : `stale (${hb.status})`}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{timeAgo(hb.last_seen_at)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{hb.jobs_processed_total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Job status counts */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
          Vision-index jobs (last 500)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['queued', 'running', 'completed', 'failed'] as const).map((s) => (
            <Stat key={s} label={s} value={(jobStatusCounts[s] ?? 0).toString()} />
          ))}
        </div>
      </section>

      {/* Recent fallback dispatches */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-[14px] tracking-tight mb-4" style={{ fontWeight: 700 }}>
          Recent Modal fallback dispatches (last 10, gpu_host=modal)
        </h2>
        {recentFallbacks.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No Modal fallback dispatches recently — Colab is keeping up.
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/15 border-b border-border">
              <tr>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Created</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Started</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentFallbacks.map((j, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 text-muted-foreground">{timeAgo(j.created_at)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{j.started_at ? timeAgo(j.started_at) : '—'}</td>
                  <td className="px-3 py-1.5">{j.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  const toneClass =
    tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-amber-400' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div className={`text-[20px] tabular-nums mt-1 ${toneClass}`} style={{ fontWeight: 700 }}>
        {value}
      </div>
    </div>
  )
}
