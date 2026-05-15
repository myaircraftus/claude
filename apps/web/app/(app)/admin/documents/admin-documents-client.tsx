'use client'

/**
 * Admin Document Pipeline — client interactivity.
 *
 * - AdminDocumentsRefresh: re-runs the server component every 30s so the
 *   health strip, worker list, doc table, and review counts stay live.
 * - AdminDocumentsPipeline: the recent-documents table. Each row shows the
 *   document's current pipeline status; expanding a row reveals the live
 *   per-stage timeline (upload → OCR → parsing → chunking → embedding) so
 *   the admin can see exactly where a document is and where it stalled.
 */

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronDown, FileText, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

export function AdminDocumentsRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}

export interface PipelineStage {
  stage: string
  stage_started_at: string
  stage_completed_at: string | null
  error_message: string | null
}

export interface PipelineDoc {
  id: string
  title: string
  org_name: string
  parsing_status: string
  uploaded_at: string | null
  updated_at: string | null
  parse_error: string | null
  stages: PipelineStage[]
}

const STATUS_TINT: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  indexed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  needs_ocr: 'bg-amber-50 text-amber-700 border-amber-200',
  queued: 'bg-amber-50 text-amber-700 border-amber-200',
  parsing: 'bg-blue-50 text-blue-700 border-blue-200',
  ocr_processing: 'bg-blue-50 text-blue-700 border-blue-200',
  chunking: 'bg-blue-50 text-blue-700 border-blue-200',
  embedding: 'bg-blue-50 text-blue-700 border-blue-200',
}

function tint(status: string): string {
  return STATUS_TINT[status] ?? 'bg-slate-100 text-slate-600 border-slate-200'
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return `${Math.round(ms / 86_400_000)}d ago`
}

function StageIcon({ stage, completed, error }: { stage: string; completed: boolean; error: boolean }) {
  if (error) return <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
  if (completed) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
  return <Loader2 className="h-3.5 w-3.5 text-blue-600 shrink-0 animate-spin" />
}

export function AdminDocumentsPipeline({ documents }: { documents: PipelineDoc[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-8 text-center">
        <FileText className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">No documents yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Uploaded documents appear here with their live processing status.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="w-8" />
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Document</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Organization</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Status</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Uploaded</th>
            <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {documents.map((doc) => {
            const isOpen = expanded.has(doc.id)
            return (
              <Fragment key={doc.id}>
                <tr
                  onClick={() => toggle(doc.id)}
                  className="hover:bg-muted/30 cursor-pointer"
                >
                  <td className="pl-3">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-foreground font-medium block truncate max-w-[28rem]">
                      {doc.title || '(untitled)'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{doc.org_name}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tint(doc.parsing_status)}`}
                    >
                      {doc.parsing_status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{timeAgo(doc.uploaded_at)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{timeAgo(doc.updated_at)}</td>
                </tr>
                {isOpen && (
                  <tr className="bg-slate-50/60">
                    <td />
                    <td colSpan={5} className="px-3 py-3">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
                        Pipeline stages
                      </div>
                      {doc.stages.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No per-stage progress recorded for this document yet.
                        </p>
                      ) : (
                        <ol className="space-y-1.5">
                          {doc.stages.map((s, i) => {
                            const completed = !!s.stage_completed_at
                            const hasError = !!s.error_message
                            return (
                              <li key={`${s.stage}-${i}`} className="flex items-start gap-2">
                                <StageIcon stage={s.stage} completed={completed} error={hasError} />
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-medium text-foreground">{s.stage}</span>
                                  <span className="text-[11px] text-muted-foreground ml-2">
                                    started {timeAgo(s.stage_started_at)}
                                    {s.stage_completed_at ? ` · completed ${timeAgo(s.stage_completed_at)}` : ' · in progress'}
                                  </span>
                                  {s.error_message && (
                                    <pre className="mt-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5 whitespace-pre-wrap break-words">
                                      {s.error_message}
                                    </pre>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                      {doc.parse_error && (
                        <pre className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5 whitespace-pre-wrap break-words">
                          {doc.parse_error}
                        </pre>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
