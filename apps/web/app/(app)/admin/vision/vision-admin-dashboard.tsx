'use client'

/**
 * Vision admin dashboard client component (Sprint 8.4).
 *
 * Renders the page-status histogram, embedding count, recent jobs,
 * and per-document "Render" / per-job "Dispatch" buttons. Buttons
 * POST to the API routes built in Sprint 8.2 / 8.3.
 *
 * No toasts / spinners — admin work, not user-facing. The buttons
 * disable themselves while in-flight to prevent double-submit.
 */
import { useState } from 'react'
import type { VisionIndexJob } from '@/lib/vision/types'

interface Props {
  orgId: string
  pageCountByStatus: Record<string, number>
  totalPages: number
  embeddingCount: number
  recentJobs: VisionIndexJob[]
  candidateDocs: Array<{ id: string; file_name: string | null; created_at: string }>
}

export function VisionAdminDashboard(props: Props) {
  const { pageCountByStatus, totalPages, embeddingCount, recentJobs, candidateDocs } = props

  const [busyDoc, setBusyDoc] = useState<string | null>(null)
  const [busyJob, setBusyJob] = useState<string | null>(null)
  const [log, setLog] = useState<Array<{ ts: string; line: string }>>([])

  function append(line: string) {
    setLog((prev) => [...prev, { ts: new Date().toISOString().slice(11, 19), line }].slice(-20))
  }

  async function triggerRender(sourceDocumentId: string, fileName: string | null) {
    setBusyDoc(sourceDocumentId)
    try {
      const res = await fetch('/api/vision/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceDocumentId }),
      })
      const json = await res.json().catch(() => ({}))
      append(res.ok
        ? `render queued: ${fileName ?? sourceDocumentId}`
        : `render failed (${res.status}): ${(json as any).error ?? 'unknown'}`,
      )
    } finally {
      setBusyDoc(null)
    }
  }

  async function triggerDispatch(jobId: string) {
    setBusyJob(jobId)
    try {
      const res = await fetch('/api/vision/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const json = await res.json().catch(() => ({}))
      append(res.ok
        ? `dispatch queued: ${jobId.slice(0, 8)}…`
        : `dispatch failed (${res.status}): ${(json as any).error ?? 'unknown'}`,
      )
    } finally {
      setBusyJob(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Vision Index — Admin
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Phase 8 vision-RAG operational dashboard. The pipeline is FOUNDATION
            (stub mode) — real GPU embedding requires VISION_GPU_HOST + creds.
            See <code className="font-mono text-[12px]">docs/phase-8-foundation-report.md</code>.
          </p>
        </div>
        <div className="shrink-0 flex gap-2">
          <a
            href="/admin/vision/telemetry"
            className="px-3 py-1.5 rounded border border-border bg-muted/20 hover:bg-muted/40 text-[12.5px]"
          >
            Telemetry →
          </a>
          <a
            href="/admin/vision/review"
            className="px-3 py-1.5 rounded border border-border bg-muted/20 hover:bg-muted/40 text-[12.5px]"
          >
            Review queue →
          </a>
        </div>
      </div>

      {/* Status counts */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="text-[14px] tracking-tight text-foreground mb-4" style={{ fontWeight: 700 }}>
          Vision pages — status breakdown
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {(['pending', 'rendering', 'embedding', 'indexed', 'failed', 'review_required'] as const).map((s) => (
            <div key={s} className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{s.replace('_', ' ')}</div>
              <div className="text-[20px] tabular-nums text-foreground mt-1" style={{ fontWeight: 700 }}>
                {pageCountByStatus[s] ?? 0}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-muted-foreground mt-3">
          Total pages: <span className="font-mono">{totalPages}</span>
          {' · '}
          Vision embeddings: <span className="font-mono">{embeddingCount}</span>
        </p>
      </section>

      {/* Render candidates */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="text-[14px] tracking-tight text-foreground mb-4" style={{ fontWeight: 700 }}>
          Documents without vision pages — render candidates
        </h2>
        {candidateDocs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Every recent document has at least one vision page. Older documents may not be in this list (limit 50 most-recent).
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-border">
              {candidateDocs.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-1.5 truncate max-w-md">{d.file_name ?? '(unnamed)'}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{d.id.slice(0, 8)}…</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      onClick={() => void triggerRender(d.id, d.file_name)}
                      disabled={busyDoc === d.id}
                      className="px-3 py-1 rounded border border-border bg-muted/20 hover:bg-muted/40 disabled:opacity-50 text-[11.5px]"
                    >
                      {busyDoc === d.id ? 'queueing…' : 'Render'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent jobs */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="text-[14px] tracking-tight text-foreground mb-4" style={{ fontWeight: 700 }}>
          Recent vision-index jobs
        </h2>
        {recentJobs.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No jobs yet. Render some documents to populate the queue.</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/15 border-b border-border">
              <tr>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Job</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Pages</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Status</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Host</th>
                <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Created</th>
                <th className="text-right px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentJobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{j.id.slice(0, 8)}…</td>
                  <td className="px-3 py-1.5 tabular-nums">{j.vision_page_ids.length}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border border-border bg-muted/20" style={{ fontWeight: 700 }}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{j.gpu_host ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{j.created_at.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-3 py-1.5 text-right">
                    {j.status === 'queued' ? (
                      <button
                        onClick={() => void triggerDispatch(j.id)}
                        disabled={busyJob === j.id}
                        className="px-3 py-1 rounded border border-border bg-muted/20 hover:bg-muted/40 disabled:opacity-50 text-[11.5px]"
                      >
                        {busyJob === j.id ? 'queueing…' : 'Dispatch'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Action log */}
      {log.length > 0 && (
        <section className="rounded-2xl border border-border bg-muted/10 p-5">
          <h2 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>
            Action log (this session)
          </h2>
          <div className="space-y-1 font-mono text-[11px] text-foreground/80">
            {log.map((entry, i) => (
              <div key={i}>
                <span className="text-muted-foreground mr-2">{entry.ts}</span>
                {entry.line}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
