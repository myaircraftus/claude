'use client'

/**
 * TimeClockPanel (Spec 2.3) — embeddable per-WO time clock.
 *
 * Self-fetches /api/work-orders/[id]/labor for the entry list +
 * aggregate totals. Drives clock-in (with rate + work-type pickers),
 * clock-out, and inline edit/delete of past entries.
 *
 * Spec calls for embedding inside the legacy WorkOrderPanel; we mount
 * it at /work-orders/[id]/time-clock as a dedicated sub-route per the
 * established pattern (1.1/1.2/1.3/1.4). Tab-embed in the legacy
 * WorkOrderDetail surface is a logged follow-up.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Timer, Play, StopCircle, Trash2,
  Clock, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTimeClock, formatElapsed } from './use-time-clock'
import type { TimeEntry, TimeEntryWorkType, OrgRole } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor'])

const WORK_TYPES: { value: TimeEntryWorkType; label: string }[] = [
  { value: 'labor',    label: 'Labor' },
  { value: 'ojt',      label: 'OJT' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'rework',   label: 'Rework' },
]

const WORK_TYPE_TINT: Record<TimeEntryWorkType, string> = {
  labor:    'bg-blue-50 text-blue-700 border-blue-200',
  ojt:      'bg-amber-50 text-amber-700 border-amber-200',
  warranty: 'bg-violet-50 text-violet-700 border-violet-200',
  rework:   'bg-rose-50 text-rose-700 border-rose-200',
}

interface PanelData {
  work_order: { id: string; work_order_number: string | null }
  aggregate: {
    closed_hours: number
    closed_cost: number
    open_entries: number
    open_running_hours: number
    open_running_cost: number
    manual_lines_hours: number
    manual_lines_cost: number
    total_hours: number
    total_cost: number
  }
  entries: TimeEntry[]
}

export function TimeClockPanel({
  workOrderId,
  userRole,
  defaultRate = 0,
}: {
  workOrderId: string
  userRole: OrgRole
  /** Suggested hourly rate for the clock-in form. Operator can override. */
  defaultRate?: number
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const tc = useTimeClock()
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [rateDraft, setRateDraft] = useState(String(defaultRate || ''))
  const [workType, setWorkType] = useState<TimeEntryWorkType>('labor')
  const [overtime, setOvertime] = useState(false)
  const [notes, setNotes] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/labor`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as PanelData)
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => { refresh() }, [refresh])
  // Re-fetch the panel when the user clocks in/out elsewhere (the chip).
  useEffect(() => { refresh() }, [tc.openEntry?.id, refresh])

  async function clockIn() {
    const rate = Number(rateDraft)
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error('Hourly rate must be a non-negative number')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: workOrderId,
          hourly_rate: rate,
          work_type: workType,
          is_overtime: overtime,
          notes: notes.trim() || null,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Clock-in failed')
        return
      }
      toast.success('Clocked in')
      setShowForm(false)
      setNotes('')
      tc.refresh()
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function clockOutCurrent() {
    if (!tc.openEntry) return
    setBusy(true)
    try {
      await tc.stop()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this time entry? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/time-entries/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Delete failed')
        return
      }
      toast.success('Deleted')
      refresh()
      tc.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  const userOpenOnThisWo =
    tc.openEntry && tc.openEntry.work_order_id === workOrderId
  const aggregate = data.aggregate

  return (
    <div className="space-y-4">
      {/* Header card with totals */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
                Time clock
              </h2>
              {aggregate.open_entries > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                  <Timer className="h-2.5 w-2.5" />
                  {aggregate.open_entries} running
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
              <Stat label="Total hours" value={aggregate.total_hours.toFixed(1)} />
              <Stat label="Total cost"  value={`$${aggregate.total_cost.toFixed(2)}`} />
              <Stat label="Closed"      value={`${aggregate.closed_hours.toFixed(1)} / $${aggregate.closed_cost.toFixed(2)}`} muted />
              <Stat label="Manual lines" value={`${aggregate.manual_lines_hours.toFixed(1)} / $${aggregate.manual_lines_cost.toFixed(2)}`} muted />
            </div>
          </div>

          {canMutate && (
            <div className="flex items-center gap-2">
              {userOpenOnThisWo ? (
                <Button onClick={clockOutCurrent} disabled={busy}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <StopCircle className="h-3 w-3 mr-1.5" />}
                  Clock out — {formatElapsed(tc.elapsedMs)}
                </Button>
              ) : tc.openEntry ? (
                <Button variant="outline" disabled title={`Already clocked in to WO ${tc.openWorkOrder?.work_order_number ?? ''}`}>
                  <AlertTriangle className="h-3 w-3 mr-1.5" />
                  Already clocked in elsewhere
                </Button>
              ) : (
                <Button onClick={() => setShowForm(true)} disabled={busy}>
                  <Play className="h-3 w-3 mr-1.5" />
                  Clock in
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Clock-in form */}
      <AnimatePresence>
        {showForm && !tc.openEntry && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="bg-white rounded-2xl border border-border p-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-[120px,1fr,1fr,1fr,auto] gap-3 items-end">
              <Field label="Rate ($/hr)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rateDraft}
                  onChange={(e) => setRateDraft(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Work type">
                <select value={workType} onChange={(e) => setWorkType(e.target.value as TimeEntryWorkType)} className={inputCls}>
                  {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </Field>
              <Field label="Notes (optional)">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="What you're starting on…" />
              </Field>
              <label className="inline-flex items-center gap-1.5 text-[12px] text-foreground cursor-pointer self-end pb-2">
                <input type="checkbox" checked={overtime} onChange={(e) => setOvertime(e.target.checked)} className="rounded border-border" />
                Overtime
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button onClick={clockIn} disabled={busy}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Play className="h-3 w-3 mr-1.5" />}
                  Start
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entry list */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Entries ({data.entries.length})
          </h3>
        </div>
        {data.entries.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">
            No clock-in entries yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence>
              {data.entries.map((e) => {
                const open = !e.end_time
                const startMs = new Date(e.start_time).getTime()
                const endMs = e.end_time ? new Date(e.end_time).getTime() : Date.now()
                const hours = Math.max(0, (endMs - startMs) / 3_600_000)
                const cost = hours * Number(e.hourly_rate)
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className={cn(
                      'px-4 py-3 flex items-center gap-3',
                      open && 'bg-emerald-50/40',
                    )}
                  >
                    <div className={cn(
                      'w-9 h-9 rounded-xl border flex items-center justify-center shrink-0',
                      open ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted/40 text-muted-foreground border-border',
                    )}>
                      {open ? <Timer className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] text-foreground font-mono" style={{ fontWeight: 600 }}>
                          {hours.toFixed(2)} hr
                        </span>
                        <span className="text-[12px] text-muted-foreground">@ ${Number(e.hourly_rate).toFixed(2)}/hr</span>
                        <span className="text-[13px] text-foreground font-mono" style={{ fontWeight: 600 }}>
                          = ${cost.toFixed(2)}
                        </span>
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', WORK_TYPE_TINT[e.work_type])} style={{ fontWeight: 700 }}>
                          {e.work_type}
                        </span>
                        {e.is_overtime && (
                          <span className="inline-flex items-center text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                            OT
                          </span>
                        )}
                        {open && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                            <Timer className="h-2.5 w-2.5" /> running
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{new Date(e.start_time).toLocaleString()}</span>
                        <span aria-hidden>→</span>
                        <span>{e.end_time ? new Date(e.end_time).toLocaleString() : 'now'}</span>
                      </div>
                      {e.notes && (
                        <p className="mt-1 text-[11.5px] text-muted-foreground italic line-clamp-2">{e.notes}</p>
                      )}
                    </div>
                    {canMutate && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => deleteEntry(e.id)}
                          disabled={busy}
                          title="Delete"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div className={cn('text-[16px] font-mono mt-0.5', muted ? 'text-muted-foreground' : 'text-foreground')} style={{ fontWeight: 700 }}>
        {value}
      </div>
    </div>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
