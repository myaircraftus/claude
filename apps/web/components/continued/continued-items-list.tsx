'use client'

/**
 * ContinuedItemsList (Spec 1.4) — render a list of continued items with
 * priority pills, discovered/resolved metadata, inline status changes
 * and resolve flow.
 *
 * Used by both the per-aircraft panel and the org-wide page.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Bookmark, AlertTriangle, Clock, CheckCircle2, Ban, Trash2, Loader2, Play,
  ArrowRightCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ContinuedItem, ContinuedItemPriority, ContinuedItemStatus, OrgRole } from '@/types'

const PRIORITY_TINT: Record<ContinuedItemPriority, string> = {
  urgent: 'bg-rose-50 text-rose-700 border-rose-200',
  high:   'bg-amber-50 text-amber-700 border-amber-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low:    'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_TINT: Record<ContinuedItemStatus, string> = {
  open:          'bg-amber-50 text-amber-700 border-amber-200',
  'in-progress': 'bg-blue-50 text-blue-700 border-blue-200',
  completed:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  'wont-fix':    'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_ICON: Record<ContinuedItemStatus, any> = {
  open:          AlertTriangle,
  'in-progress': Clock,
  completed:     CheckCircle2,
  'wont-fix':    Ban,
}

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

export function ContinuedItemsList({
  items,
  showAircraft = false,
  tailById,
  userRole,
  onChange,
}: {
  items: ContinuedItem[]
  /** When true, show the aircraft tail next to each row (org-wide view). */
  showAircraft?: boolean
  /** Provide tail lookup so rows can render the tail without an extra fetch. */
  tailById?: Map<string, string>
  userRole: OrgRole
  onChange: () => void
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-2xl bg-white border border-border flex items-center justify-center mb-2">
          <Bookmark className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          No continued items.
        </p>
      </div>
    )
  }

  async function patchStatus(id: string, status: ContinuedItemStatus) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/continued-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Update failed'); return }
      onChange()
    } finally {
      setBusyId(null)
    }
  }

  async function deleteItem(id: string, description: string) {
    if (!confirm(`Delete continued item "${description.slice(0, 60)}…"?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/continued-items/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Delete failed')
        return
      }
      toast.success('Deleted')
      onChange()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="space-y-2">
      <AnimatePresence>
        {items.map((item) => {
          const StatusIcon = STATUS_ICON[item.status]
          const tint = STATUS_TINT[item.status]
          const busy = busyId === item.id
          const resolving = resolvingId === item.id
          const isResolved = item.status === 'completed' || item.status === 'wont-fix'
          return (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className={cn(
                'bg-white rounded-2xl border border-border p-3 sm:p-4',
                isResolved && 'opacity-80',
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', tint)}>
                  <StatusIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
                      {item.description}
                    </h3>
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tint)} style={{ fontWeight: 700 }}>
                      {item.status}
                    </span>
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', PRIORITY_TINT[item.priority])} style={{ fontWeight: 700 }}>
                      {item.priority}
                    </span>
                    {showAircraft && (
                      <span className="text-[11px] text-muted-foreground">
                        · {tailById?.get(item.aircraft_id) ?? item.aircraft_id.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground">
                    <span>Discovered {item.discovered_date}</span>
                    {item.discovered_on_work_order && (
                      <span>· WO <span className="font-mono">{item.discovered_on_work_order.slice(0, 8)}</span></span>
                    )}
                    {item.resolved_at && (
                      <span>· Resolved {item.resolved_at.slice(0, 10)}</span>
                    )}
                    {item.resolved_on_work_order && (
                      <span>· closed on WO <span className="font-mono">{item.resolved_on_work_order.slice(0, 8)}</span></span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="mt-1.5 text-[12px] text-muted-foreground whitespace-pre-line line-clamp-3">
                      {item.notes}
                    </p>
                  )}

                  {resolving && (
                    <ResolveInline
                      itemId={item.id}
                      onClose={() => setResolvingId(null)}
                      onDone={() => { setResolvingId(null); onChange() }}
                    />
                  )}
                </div>

                {canMutate && !isResolved && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => setResolvingId(resolving ? null : item.id)}
                      disabled={busy}
                      title="Resolve"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border border-border bg-white hover:bg-muted text-foreground"
                      style={{ fontWeight: 500 }}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Resolve
                    </button>
                    {item.status === 'open' && (
                      <button
                        onClick={() => patchStatus(item.id, 'in-progress')}
                        disabled={busy}
                        title="Mark in-progress"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ fontWeight: 500 }}
                      >
                        <ArrowRightCircle className="h-3 w-3" /> Start
                      </button>
                    )}
                    <button
                      onClick={() => deleteItem(item.id, item.description)}
                      disabled={busy}
                      title="Delete"
                      className="text-muted-foreground hover:text-rose-600 mt-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {canMutate && isResolved && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => patchStatus(item.id, 'open')}
                      disabled={busy}
                      title="Re-open"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      style={{ fontWeight: 500 }}
                    >
                      <Play className="h-3 w-3" /> Re-open
                    </button>
                    <button
                      onClick={() => deleteItem(item.id, item.description)}
                      disabled={busy}
                      title="Delete"
                      className="text-muted-foreground hover:text-rose-600 mt-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function ResolveInline({
  itemId,
  onClose,
  onDone,
}: {
  itemId: string
  onClose: () => void
  onDone: () => void
}) {
  const [woId, setWoId] = useState('')
  const [status, setStatus] = useState<'completed' | 'wont-fix'>('completed')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/continued-items/${itemId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          work_order_id: woId.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Resolve failed')
        return
      }
      toast.success(status === 'completed' ? 'Item resolved' : 'Marked won\'t fix')
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto,auto] gap-2 items-end">
      <Field label="Resolution">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'completed' | 'wont-fix')}
          className={resolveInputCls}
        >
          <option value="completed">Completed</option>
          <option value="wont-fix">Won't fix</option>
        </select>
      </Field>
      <Field label="Closed on (WO id)" hint="optional">
        <input
          type="text"
          value={woId}
          onChange={(e) => setWoId(e.target.value)}
          placeholder="UUID"
          className={`${resolveInputCls} font-mono`}
        />
      </Field>
      <Field label="Notes" hint="optional">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="resolution notes…"
          className={resolveInputCls}
        />
      </Field>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] bg-primary text-white"
        style={{ fontWeight: 500 }}
      >
        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
        Save
      </button>
      <button
        onClick={onClose}
        disabled={submitting}
        className="text-[11px] text-muted-foreground hover:text-foreground px-2"
        style={{ fontWeight: 500 }}
      >
        Cancel
      </button>
    </div>
  )
}

const resolveInputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-primary'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {label}
      </label>
      {children}
      {hint && <div className="text-[9.5px] text-muted-foreground/80 mt-0.5">{hint}</div>}
    </div>
  )
}
