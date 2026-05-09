'use client'

/**
 * Review queue client UI (Phase 8 Sprint 8.7).
 *
 * Three tabs (Pending / Reviewed / Dismissed). Each row = a flagged
 * page. Click → modal with page metadata + action buttons that PATCH
 * /api/vision/review/[id] with the chosen status.
 */
import { useState, useMemo } from 'react'

interface DecoratedItem {
  id: string
  organization_id: string
  vision_page_id: string
  search_query: string | null
  confidence_score: number | null
  reason: 'low_confidence' | 'failed_index' | 'user_flag'
  status: 'pending' | 'reviewed_ok' | 'reviewed_problem' | 'dismissed'
  reviewer_user_id: string | null
  reviewer_notes: string | null
  reviewed_at: string | null
  created_at: string
  page_number: number | null
  source_document_id: string | null
  file_name: string | null
}

type Tab = 'pending' | 'reviewed' | 'dismissed'

interface Props {
  pending: DecoratedItem[]
  reviewed: DecoratedItem[]
  dismissed: DecoratedItem[]
}

const REASON_LABEL: Record<DecoratedItem['reason'], string> = {
  low_confidence: 'Low confidence',
  failed_index: 'Failed indexing',
  user_flag: 'User flagged',
}

const STATUS_LABEL: Record<DecoratedItem['status'], string> = {
  pending: 'Pending',
  reviewed_ok: 'OK',
  reviewed_problem: 'Problem',
  dismissed: 'Dismissed',
}

export function ReviewQueueClient({ pending, reviewed, dismissed }: Props) {
  const [tab, setTab] = useState<Tab>('pending')
  const [selected, setSelected] = useState<DecoratedItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const items = useMemo(() => {
    if (tab === 'pending') return pending
    if (tab === 'reviewed') return reviewed
    return dismissed
  }, [tab, pending, reviewed, dismissed])

  function openItem(item: DecoratedItem) {
    setSelected(item)
    setNotes(item.reviewer_notes ?? '')
    setErrorMsg(null)
  }

  function closeModal() {
    setSelected(null)
    setBusy(false)
    setNotes('')
    setErrorMsg(null)
  }

  async function actOn(status: DecoratedItem['status']) {
    if (!selected) return
    setBusy(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/vision/review/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewer_notes: notes.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) {
        setErrorMsg(json?.error ?? `Update failed (${res.status})`)
        setBusy(false)
        return
      }
      // Refresh the page to pull updated lists from server.
      window.location.reload()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Vision Review Queue
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Pages flagged for human triage. Items land here automatically when
          retrieval falls below the confidence threshold or a vision-index job
          fails on the majority of its pages.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(
          [
            { id: 'pending' as const, label: `Pending (${pending.length})` },
            { id: 'reviewed' as const, label: `Reviewed (${reviewed.length})` },
            { id: 'dismissed' as const, label: `Dismissed (${dismissed.length})` },
          ]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-[13px] border-b-2 -mb-px ${
              tab === t.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded border border-border bg-card px-4 py-12 text-center text-[13px] text-muted-foreground">
          No items in this view.
        </div>
      ) : (
        <div className="rounded border border-border bg-card overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Document</th>
                <th className="text-left px-3 py-2 font-medium">Page</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-left px-3 py-2 font-medium">Query</th>
                <th className="text-left px-3 py-2 font-medium">Confidence</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-border hover:bg-muted/20 cursor-pointer"
                  onClick={() => openItem(item)}
                >
                  <td className="px-3 py-2 truncate max-w-[260px]" title={item.file_name ?? ''}>
                    {item.file_name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {item.page_number !== null ? `p. ${item.page_number}` : '—'}
                  </td>
                  <td className="px-3 py-2">{REASON_LABEL[item.reason]}</td>
                  <td className="px-3 py-2 truncate max-w-[280px]" title={item.search_query ?? ''}>
                    {item.search_query ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {item.confidence_score !== null
                      ? item.confidence_score.toFixed(3)
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[item.status]}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-background rounded-lg max-w-xl w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[15px] font-semibold">
                  {selected.file_name ?? 'Untitled doc'}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  Page {selected.page_number ?? '—'} · {REASON_LABEL[selected.reason]}
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-muted-foreground hover:text-foreground text-[18px] leading-none"
              >
                ×
              </button>
            </div>

            <dl className="grid grid-cols-3 gap-y-2 text-[12px] mb-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2">{STATUS_LABEL[selected.status]}</dd>
              <dt className="text-muted-foreground">Query</dt>
              <dd className="col-span-2 break-words">{selected.search_query ?? '—'}</dd>
              <dt className="text-muted-foreground">Confidence</dt>
              <dd className="col-span-2 tabular-nums">
                {selected.confidence_score !== null
                  ? selected.confidence_score.toFixed(3)
                  : '—'}
              </dd>
              <dt className="text-muted-foreground">Page id</dt>
              <dd className="col-span-2 font-mono text-[11px] break-all">
                {selected.vision_page_id}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="col-span-2">
                {new Date(selected.created_at).toLocaleString()}
              </dd>
            </dl>

            <label className="block text-[12px] text-muted-foreground mb-1">
              Reviewer notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-background p-2 text-[13px]"
              placeholder="Why this is OK / a problem / dismissed"
              maxLength={4000}
            />

            {errorMsg ? (
              <div className="mt-3 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                {errorMsg}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              {selected.status === 'pending' || selected.status === 'dismissed' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => actOn('dismissed')}
                    className="px-3 py-1.5 text-[13px] rounded border border-border hover:bg-muted disabled:opacity-50"
                  >
                    {selected.status === 'dismissed' ? 'Re-dismiss' : 'Dismiss'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => actOn('reviewed_problem')}
                    className="px-3 py-1.5 text-[13px] rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Mark Problem
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => actOn('reviewed_ok')}
                    className="px-3 py-1.5 text-[13px] rounded bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                  >
                    Mark OK
                  </button>
                </>
              ) : (
                <div className="text-[12px] text-muted-foreground">
                  This item has reached a terminal state and cannot be re-actioned.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
