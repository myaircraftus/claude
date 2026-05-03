'use client'

/**
 * BulkUpdatesView (Cross-cutting Concern 3) — list of bulk_update_jobs
 * for the org. Read-only audit trail; jobs are created from list views
 * via the "Apply to N selected" UI in those views (logged follow-up to
 * roll out per-list).
 */

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, X, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Job {
  id: string
  entity_type: string
  entity_ids: string[]
  patch: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  results_count: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

const TONE: Record<Job['status'], string> = {
  pending:   'bg-blue-50 text-blue-700 border-blue-200',
  running:   'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed:    'bg-rose-50 text-rose-700 border-rose-200',
}

export function BulkUpdatesView() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancel = false
    fetch('/api/bulk-updates')
      .then((r) => r.json())
      .then((j: { jobs?: Job[]; error?: string }) => {
        if (cancel) return
        if (j.error) setError(j.error)
        else setJobs(j.jobs ?? [])
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Bulk updates</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Multi-row patch jobs created from list views (work orders, inspections, costs, etc.). This page is the audit trail.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground">No bulk updates yet.</p>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/15 border-b border-border">
              <tr>
                {['Created', 'Entity', '# rows', 'Status', 'Updated', 'Patch'].map((h, i) => (
                  <th key={i} className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                    {new Date(j.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-1.5 capitalize">{j.entity_type.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-1.5 tabular-nums">{j.entity_ids.length}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn('inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', TONE[j.status])} style={{ fontWeight: 700 }}>
                      {j.status === 'completed' && <CheckCircle2 className="h-2.5 w-2.5" />}
                      {j.status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {j.status === 'failed' && <X className="h-2.5 w-2.5" />}
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{j.results_count}</td>
                  <td className="px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground truncate max-w-[24ch]">
                    {JSON.stringify(j.patch)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
