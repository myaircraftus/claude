'use client'

/**
 * Phase 14 Sprint 14.5 — admin batch panel client.
 *
 * Shows the queue summary + Run-Now buttons per tier. Refreshes every
 * 30s by polling /api/admin/billing/queue-stats.
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, Zap, Clock } from 'lucide-react'

interface PanelProps {
  initialByStatus: Record<string, Record<string, number>>
  queuedTotalPages: number
  oldestScheduledFor: string | null
  newestCompletedAt: string | null
}

interface QueueStats {
  by_status: Record<string, Record<string, number>>
  queued_total_pages: number
  oldest_scheduled_for: string | null
  newest_completed_at: string | null
  modal_cost_estimate_usd: number
}

export function BatchPanel({
  initialByStatus,
  queuedTotalPages,
  oldestScheduledFor,
  newestCompletedAt,
}: PanelProps) {
  const [stats, setStats] = useState<QueueStats>({
    by_status: initialByStatus,
    queued_total_pages: queuedTotalPages,
    oldest_scheduled_for: oldestScheduledFor,
    newest_completed_at: newestCompletedAt,
    modal_cost_estimate_usd: queuedTotalPages * 0.0015,
  })
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/billing/queue-stats')
      if (res.ok) {
        const body = (await res.json()) as QueueStats
        setStats(body)
      }
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  async function runNow(tier: 'standard' | 'pro' | 'all') {
    setBusy(tier)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/billing/batch/run-now', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMessage(`Error: ${body.error ?? `HTTP ${res.status}`}`)
      } else {
        setMessage(`Bumped ${body.bumped} ${tier} job(s) to NOW.`)
        await refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  const total = Object.values(stats.by_status).reduce(
    (sum, byHost) => sum + Object.values(byHost).reduce((s, n) => s + n, 0),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {message && (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900">
          {message}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Total jobs</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{total}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Queued pages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.queued_total_pages.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              ~${stats.modal_cost_estimate_usd.toFixed(2)} on Modal
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Next batch window</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {stats.oldest_scheduled_for
                ? new Date(stats.oldest_scheduled_for).toLocaleString()
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground">
              Last completed:{' '}
              {stats.newest_completed_at
                ? new Date(stats.newest_completed_at).toLocaleString()
                : '—'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Status × worker host</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Colab</th>
                <th className="px-2 py-1">Modal</th>
                <th className="px-2 py-1">Other / null</th>
                <th className="px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.by_status).map(([status, hosts]) => {
                const colab = hosts.colab ?? 0
                const modal = hosts.modal ?? 0
                const other = Object.entries(hosts)
                  .filter(([h]) => h !== 'colab' && h !== 'modal')
                  .reduce((s, [, n]) => s + n, 0)
                const tot = colab + modal + other
                return (
                  <tr key={status} className="border-t">
                    <td className="px-2 py-1 font-medium">{status}</td>
                    <td className="px-2 py-1">{colab}</td>
                    <td className="px-2 py-1">{modal}</td>
                    <td className="px-2 py-1">{other}</td>
                    <td className="px-2 py-1 text-right">{tot}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Run now (force-bump scheduled_for)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Bumps scheduled_for to NOW so the queue worker / Modal fallback picks them up
            immediately. Use for emergencies (cron failed) or to drain Standard tier early.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => runNow('standard')} disabled={busy !== null}>
              <Clock className="mr-1 h-3 w-3" />
              {busy === 'standard' ? 'Bumping…' : 'Process Standard queue now'}
            </Button>
            <Button variant="outline" onClick={() => runNow('pro')} disabled={busy !== null}>
              <Zap className="mr-1 h-3 w-3" />
              {busy === 'pro' ? 'Bumping…' : 'Process Pro queue now'}
            </Button>
            <Button variant="ghost" onClick={() => runNow('all')} disabled={busy !== null}>
              {busy === 'all' ? 'Bumping…' : 'Process ALL queues now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
