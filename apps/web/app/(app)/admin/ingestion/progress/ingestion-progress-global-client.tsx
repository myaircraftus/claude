'use client'

/**
 * Phase 13.3 admin-only global ingestion progress view.
 *
 * Renders a flat table of (document, org, stage, age, error). Auto-refreshes
 * every 30s by polling /api/admin/ingestion-progress (which is admin-gated).
 * Falls back to the SSR-provided initialRows if the poll fails.
 */
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

interface ActiveRow {
  id: string
  document_id: string
  organization_id: string
  stage: string
  stage_started_at: string
  stage_completed_at: string | null
  error_message: string | null
}

const TERMINAL = new Set(['indexed', 'failed'])

export function IngestionProgressGlobal({ initialRows }: { initialRows: ActiveRow[] }) {
  const [rows, setRows] = useState<ActiveRow[]>(initialRows)
  const [filter, setFilter] = useState<'active' | 'all' | 'failed'>('active')
  const [refreshing, setRefreshing] = useState(false)

  // Poll every 30s
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      try {
        const res = await fetch('/api/admin/ingestion-progress')
        if (!res.ok || cancelled) return
        const body = (await res.json()) as { rows: ActiveRow[] }
        if (!cancelled) setRows(body.rows)
      } catch {
        // network blip — keep current rows
      }
    }
    const interval = setInterval(refresh, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function manualRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/ingestion-progress')
      if (res.ok) {
        const body = (await res.json()) as { rows: ActiveRow[] }
        setRows(body.rows)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const visible = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'failed') return r.stage === 'failed'
    return !TERMINAL.has(r.stage) // active default
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={filter === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('active')}
        >
          Active
        </Button>
        <Button
          variant={filter === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('failed')}
        >
          Failed
        </Button>
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All recent
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={manualRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Document</th>
              <th className="px-3 py-2 text-left font-medium">Org</th>
              <th className="px-3 py-2 text-left font-medium">Stage</th>
              <th className="px-3 py-2 text-left font-medium">Started</th>
              <th className="px-3 py-2 text-left font-medium">Age</th>
              <th className="px-3 py-2 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No rows match the current filter.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2 font-mono text-xs">{r.document_id.slice(0, 8)}…</td>
                <td className="px-3 py-2 font-mono text-xs">{r.organization_id.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  <Badge variant={r.stage === 'failed' ? 'destructive' : 'secondary'}>
                    {r.stage}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {new Date(r.stage_started_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs">{formatAge(r.stage_started_at)}</td>
                <td className="px-3 py-2 max-w-md truncate text-xs text-destructive">
                  {r.error_message ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatAge(start: string): string {
  const ms = Date.now() - new Date(start).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}
