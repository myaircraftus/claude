'use client'

/**
 * Phase 13.4 admin error log — client component.
 *
 * Renders a sortable table of failed ingestions with Retry + Mark resolved.
 * Polls /api/admin/errors every 60s for fresh data.
 */
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, RotateCw, CheckCheck, AlertTriangle } from 'lucide-react'

export interface ErrorRow {
  id: string
  document_id: string
  organization_id: string
  stage_started_at: string
  error_message: string | null
  resolved: boolean
  doc_title: string
  doc_type: string | null
  uploaded_by_persona: string | null
  page_count: number | null
}

export function ErrorLogClient({ initialRows }: { initialRows: ErrorRow[] }) {
  const [rows, setRows] = useState<ErrorRow[]>(initialRows)
  const [showResolved, setShowResolved] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Background poll
  useEffect(() => {
    const interval = setInterval(refresh, 60_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/errors')
      if (!res.ok) return
      const body = (await res.json()) as { rows: ErrorRow[] }
      setRows(body.rows)
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRetry(documentId: string) {
    setBusy(`retry:${documentId}`)
    try {
      const res = await fetch('/api/admin/errors/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? `Retry failed (${res.status})`)
      } else {
        await refresh()
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleResolve(progressId: string) {
    setBusy(`resolve:${progressId}`)
    try {
      const res = await fetch('/api/admin/errors/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressId }),
      })
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === progressId ? { ...r, resolved: true } : r)),
        )
      }
    } finally {
      setBusy(null)
    }
  }

  const visible = rows.filter((r) => (showResolved ? true : !r.resolved))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={showResolved ? 'outline' : 'default'}
          size="sm"
          onClick={() => setShowResolved(false)}
        >
          Open ({rows.filter((r) => !r.resolved).length})
        </Button>
        <Button
          variant={showResolved ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowResolved(true)}
        >
          All ({rows.length})
        </Button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-1 h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Document</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Uploader</th>
              <th className="px-3 py-2 text-left font-medium">Failed at</th>
              <th className="px-3 py-2 text-left font-medium">Error</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No errors{showResolved ? '' : ' (all resolved or none reported)'}.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className={`border-b ${r.resolved ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 max-w-xs">
                  <div className="font-medium truncate">{r.doc_title}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {r.document_id.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.doc_type && <Badge variant="outline">{r.doc_type}</Badge>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.uploaded_by_persona && <Badge>{r.uploaded_by_persona}</Badge>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {new Date(r.stage_started_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 max-w-md text-xs">
                  <div className="flex items-start gap-1 text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="font-mono break-all">
                      {r.error_message ?? '—'}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(r.document_id)}
                      disabled={busy === `retry:${r.document_id}` || r.resolved}
                    >
                      <RotateCw className="mr-1 h-3 w-3" />
                      {busy === `retry:${r.document_id}` ? 'Retrying…' : 'Retry'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleResolve(r.id)}
                      disabled={busy === `resolve:${r.id}` || r.resolved}
                    >
                      <CheckCheck className="mr-1 h-3 w-3" />
                      {r.resolved ? 'Resolved' : 'Mark resolved'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
