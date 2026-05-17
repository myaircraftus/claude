'use client'

/**
 * Time Off Requests — workforce surface.
 *
 * Header + New Request button, status filter tabs (All / Pending / Approved /
 * Denied with counts), a table with colored status badges, inline approve/deny
 * on pending rows, and a New Request modal. Backed by /api/time-off-requests
 * and /api/time-off-requests/[id]/decide.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, CalendarOff, Plus, Loader2, Check, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TimeOffRequest {
  id: string
  organization_id: string
  employee_id: string
  request_type: string
  start_date: string
  end_date: string
  status: string
  reason: string | null
  manager_comment: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

interface RosterEntry {
  user_id: string
  name: string
}

// API request_type contract — see /api/time-off-requests (ALLOWED_TYPES).
const REQUEST_TYPES = ['Holiday', 'Medical', 'Personal', 'Bereavement', 'Jury Duty']

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'denied', label: 'Denied' },
]

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  denied: { label: 'Denied', cls: 'bg-red-50 text-red-700 border-red-200' },
  draft: { label: 'Draft', cls: 'bg-muted text-muted-foreground border-border' },
  cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground border-border' },
}

const EMPTY_FORM = {
  request_type: 'Holiday',
  start_date: '',
  end_date: '',
  reason: '',
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Inclusive day count between two ISO dates.
function dayCount(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
}

export function TimeOffClient({
  requests,
  roster,
}: {
  requests: TimeOffRequest[]
  roster: RosterEntry[]
}) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roster) m.set(r.user_id, r.name)
    return m
  }, [roster])

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: requests.length,
      pending: 0,
      approved: 0,
      denied: 0,
    }
    for (const r of requests) if (r.status in c) c[r.status] += 1
    return c
  }, [requests])

  const filtered = useMemo(
    () => requests.filter((r) => statusFilter === 'all' || r.status === statusFilter),
    [requests, statusFilter],
  )

  async function decide(id: string, decision: 'approved' | 'denied') {
    setDecidingId(id)
    try {
      const res = await fetch(`/api/time-off-requests/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? `Could not ${decision === 'approved' ? 'approve' : 'deny'} request`)
        return
      }
      toast.success(decision === 'approved' ? 'Request approved' : 'Request denied')
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setDecidingId(null)
    }
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start_date || !form.end_date) {
      toast.error('Start and end dates are required')
      return
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be on or after start date')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/time-off-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: form.request_type,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not submit request')
        return
      }
      toast.success('Time off request submitted')
      setAddOpen(false)
      setForm({ ...EMPTY_FORM })
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Time Off Requests
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Employee PTO requests and manager approvals.
          </p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Request
        </Button>
      </div>

      {/* Status tabs */}
      <div className="px-6 pt-3 bg-white border-b border-border shrink-0">
        <div className="flex gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-2 text-[13px] border-b-2 -mb-px transition-colors ${
                statusFilter === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              style={{ fontWeight: statusFilter === t.key ? 600 : 500 }}
            >
              {t.label} <span className="text-muted-foreground/70">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {requests.length === 0 ? (
          <EmptyState onAdd={() => { setForm({ ...EMPTY_FORM }); setAddOpen(true) }} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No requests in this view.
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Mechanic', 'Request Type', 'Start Date', 'End Date', 'Days', 'Status', ''].map((h, i) => (
                    <th
                      key={h || `actions-${i}`}
                      className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground"
                      style={{ fontWeight: 600 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.draft
                  return (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5">
                        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                          {nameById.get(r.employee_id) ?? 'Unknown'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground capitalize">
                        {r.request_type}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        {fmtDate(r.start_date)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        {fmtDate(r.end_date)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums">
                        {dayCount(r.start_date, r.end_date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] border ${meta.cls}`}
                          style={{ fontWeight: 700 }}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {r.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={decidingId === r.id}
                              onClick={() => decide(r.id, 'approved')}
                            >
                              {decidingId === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Check className="h-3 w-3 mr-1" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700"
                              disabled={decidingId === r.id}
                              onClick={() => decide(r.id, 'denied')}
                            >
                              <Ban className="h-3 w-3 mr-1" />
                              Deny
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <NewRequestModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSubmit={createRequest}
        />
      )}
    </div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <CalendarOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No time off requests yet</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        Submit a request for vacation, medical, or personal time off and managers can approve it here.
      </p>
      <Button variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> New Request
      </Button>
    </div>
  )
}

function NewRequestModal({
  form,
  setForm,
  saving,
  onClose,
  onSubmit,
}: {
  form: typeof EMPTY_FORM
  setForm: (f: typeof EMPTY_FORM) => void
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">New Time Off Request</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Request Type">
            <select
              value={form.request_type}
              onChange={(e) => set('request_type', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start Date *">
              <Text type="date" value={form.start_date} onChange={(v) => set('start_date', v)} />
            </Field>
            <Field label="End Date *">
              <Text type="date" value={form.end_date} onChange={(v) => set('end_date', v)} />
            </Field>
          </div>
          <Field label="Reason / Notes">
            <textarea
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
              rows={3}
              className="w-full px-2.5 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Text({
  value,
  onChange,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
