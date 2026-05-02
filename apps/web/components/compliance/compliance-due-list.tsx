'use client'

/**
 * ComplianceDueList (Spec 1.2) — render a list of compliance items with
 * status pills, due-date / due-hours, and inline mark-complete /
 * defer / undefer actions.
 *
 * Used by:
 *  - CompliancePage (whole-org view, default tab "Due List")
 *  - AircraftCompliancePanel (per-aircraft view)
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  AlertTriangle, Clock, CheckCircle2, Pause, Play, ClipboardCheck,
  ShieldAlert, Loader2, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ComplianceItem, ComplianceStatus, OrgRole } from '@/types'

const STATUS_TINT: Record<ComplianceStatus, string> = {
  overdue:    'bg-rose-50 text-rose-700 border-rose-200',
  'due-soon': 'bg-amber-50 text-amber-700 border-amber-200',
  current:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  deferred:   'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_ICON: Record<ComplianceStatus, any> = {
  overdue:    AlertTriangle,
  'due-soon': Clock,
  current:    CheckCircle2,
  deferred:   Pause,
}

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

export function ComplianceDueList({
  items,
  userRole,
  showAircraft = false,
  onChange,
}: {
  items: ComplianceItem[]
  userRole: OrgRole
  /** When true, render the aircraft tail next to each row (whole-org view). */
  showAircraft?: boolean
  onChange: () => void
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <div className="mx-auto w-10 h-10 rounded-2xl bg-white border border-border flex items-center justify-center mb-2">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          No compliance items.
        </p>
      </div>
    )
  }

  async function setStatus(id: string, status: ComplianceStatus) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/compliance-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Update failed')
        return
      }
      onChange()
    } finally {
      setBusyId(null)
    }
  }

  async function deleteItem(id: string, title: string) {
    if (!confirm(`Delete compliance item "${title}"?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/compliance-items/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Delete failed')
        return
      }
      toast.success('Item deleted')
      onChange()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="space-y-2">
      <AnimatePresence>
        {items.map((item) => {
          const Icon = STATUS_ICON[item.status]
          const tint = STATUS_TINT[item.status]
          const busy = busyId === item.id
          const completing = completingId === item.id
          return (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="bg-white rounded-2xl border border-border p-3 sm:p-4"
            >
              <div className="flex items-start gap-3">
                <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', tint)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                      {item.title}
                    </h3>
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tint)} style={{ fontWeight: 700 }}>
                      {item.status}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border border-border px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                      {item.source}
                    </span>
                    {item.requires_rii && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                        <ShieldAlert className="h-2.5 w-2.5" /> RII
                      </span>
                    )}
                    {showAircraft && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        · {item.aircraft_id.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground">
                    {item.next_due_date && (
                      <span>Next due: <span className="text-foreground" style={{ fontWeight: 500 }}>{item.next_due_date}</span></span>
                    )}
                    {item.next_due_hours != null && (
                      <span>or at <span className="text-foreground font-mono" style={{ fontWeight: 500 }}>{Number(item.next_due_hours).toFixed(1)}</span> hrs</span>
                    )}
                    {item.next_due_cycles != null && (
                      <span>or at <span className="text-foreground font-mono" style={{ fontWeight: 500 }}>{item.next_due_cycles}</span> cycles</span>
                    )}
                    {item.last_completed_date && (
                      <span>· last done {item.last_completed_date}</span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2">{item.notes}</p>
                  )}

                  {completing && (
                    <CompleteInline
                      itemId={item.id}
                      onClose={() => setCompletingId(null)}
                      onDone={() => { setCompletingId(null); onChange() }}
                    />
                  )}
                </div>

                {canMutate && (
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => setCompletingId(completing ? null : item.id)}
                      disabled={busy}
                      title="Mark complete"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] border border-border bg-white hover:bg-muted text-foreground"
                      style={{ fontWeight: 500 }}
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Complete
                    </button>
                    {item.status === 'deferred' ? (
                      <button
                        onClick={() => setStatus(item.id, 'current')}
                        disabled={busy}
                        title="Resume tracking"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ fontWeight: 500 }}
                      >
                        <Play className="h-3 w-3" /> Undefer
                      </button>
                    ) : (
                      <button
                        onClick={() => setStatus(item.id, 'deferred')}
                        disabled={busy}
                        title="Defer (waiting on parts, etc.)"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        style={{ fontWeight: 500 }}
                      >
                        <Pause className="h-3 w-3" /> Defer
                      </button>
                    )}
                    <button
                      onClick={() => deleteItem(item.id, item.title)}
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

function CompleteInline({
  itemId,
  onClose,
  onDone,
}: {
  itemId: string
  onClose: () => void
  onDone: () => void
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState('')
  const [cycles, setCycles] = useState('')
  const [woId, setWoId] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/compliance-items/${itemId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completed_date: date,
          completed_hours: hours || undefined,
          completed_cycles: cycles || undefined,
          work_order_id: woId.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Could not mark complete')
        return
      }
      toast.success('Item marked complete')
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,1fr,auto,auto] gap-2 items-end">
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={completeInputCls} />
      </Field>
      <Field label="At hours" hint="defaults to current">
        <input type="number" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} className={completeInputCls} />
      </Field>
      <Field label="Cycles" hint="optional">
        <input type="number" value={cycles} onChange={(e) => setCycles(e.target.value)} className={completeInputCls} />
      </Field>
      <Field label="WO id" hint="optional">
        <input type="text" value={woId} onChange={(e) => setWoId(e.target.value)} placeholder="UUID" className={completeInputCls} />
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

const completeInputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-primary'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
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
