'use client'

/**
 * Shift Scheduler — weekly calendar surface for /workforce/scheduler.
 *
 * 7-column Mon–Sun grid with one row per roster mechanic. Each mechanic
 * gets a distinct color; their shifts render as colored blocks in the
 * matching day cell. Prev/next buttons shift the visible week window;
 * shifts are filtered client-side by start_time. "Add Shift" POSTs to
 * /api/shifts then router.refresh().
 */

import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { X, CalendarDays, Plus, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Shift {
  id: string
  organization_id: string
  location_id: string | null
  name: string
  technician_id: string | null
  roles: string[] | null
  start_time: string
  end_time: string
  status: string | null
  notes: string | null
  created_at: string | null
}

interface RosterMember {
  user_id: string
  name: string
}

// Distinct per-mechanic palette — cycled by roster index.
const COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-900', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-100', border: 'border-emerald-300', text: 'text-emerald-900', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100', border: 'border-amber-300', text: 'text-amber-900', dot: 'bg-amber-500' },
  { bg: 'bg-violet-100', border: 'border-violet-300', text: 'text-violet-900', dot: 'bg-violet-500' },
  { bg: 'bg-rose-100', border: 'border-rose-300', text: 'text-rose-900', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-100', border: 'border-cyan-300', text: 'text-cyan-900', dot: 'bg-cyan-500' },
  { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-900', dot: 'bg-orange-500' },
  { bg: 'bg-teal-100', border: 'border-teal-300', text: 'text-teal-900', dot: 'bg-teal-500' },
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Monday 00:00 of the week containing `d`.
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function fmtDayRange(start: Date): string {
  const end = addDays(start, 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const sameMonth = start.getMonth() === end.getMonth()
  const startStr = start.toLocaleDateString(undefined, opts)
  const endStr = end.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : opts)
  return `${startStr} – ${endStr}, ${end.getFullYear()}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function toDateInputValue(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const EMPTY_FORM = {
  technician_id: '',
  date: '',
  start_time: '08:00',
  end_time: '16:00',
  name: '',
  notes: '',
}

export function SchedulerClient({
  shifts,
  roster,
}: {
  shifts: Shift[]
  roster: RosterMember[]
}) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()))
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const colorFor = useMemo(() => {
    const map = new Map<string, (typeof COLORS)[number]>()
    roster.forEach((m, i) => map.set(m.user_id, COLORS[i % COLORS.length]))
    return map
  }, [roster])

  // Day columns for the visible week.
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  )
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  // Shifts whose start_time falls inside the visible Mon–Sun window.
  const weekShifts = useMemo(
    () =>
      shifts.filter((s) => {
        const t = new Date(s.start_time).getTime()
        return t >= weekStart.getTime() && t < weekEnd.getTime()
      }),
    [shifts, weekStart, weekEnd],
  )

  // Index: technician_id → day index (0-6) → shifts.
  const grid = useMemo(() => {
    const m = new Map<string, Shift[][]>()
    for (const member of roster) m.set(member.user_id, Array.from({ length: 7 }, () => []))
    for (const s of weekShifts) {
      if (!s.technician_id) continue
      const row = m.get(s.technician_id)
      if (!row) continue
      const start = new Date(s.start_time)
      const dayIdx = Math.floor(
        (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
          weekStart.getTime()) /
          86_400_000,
      )
      if (dayIdx >= 0 && dayIdx < 7) row[dayIdx].push(s)
    }
    for (const row of m.values())
      for (const cell of row)
        cell.sort((a, b) => a.start_time.localeCompare(b.start_time))
    return m
  }, [roster, weekShifts, weekStart])

  const isToday = (d: Date) => {
    const now = new Date()
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault()
    if (!form.technician_id) {
      toast.error('Select a mechanic')
      return
    }
    if (!form.date || !form.start_time || !form.end_time) {
      toast.error('Date, start time and end time are required')
      return
    }
    const startIso = new Date(`${form.date}T${form.start_time}`).toISOString()
    const endIso = new Date(`${form.date}T${form.end_time}`).toISOString()
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      toast.error('End time must be after start time')
      return
    }
    const member = roster.find((m) => m.user_id === form.technician_id)
    setSaving(true)
    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || `${member?.name ?? 'Shift'} shift`,
          technician_id: form.technician_id,
          start_time: startIso,
          end_time: endIso,
          notes: form.notes.trim() || null,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Could not add shift')
        return
      }
      toast.success('Shift scheduled')
      setAddOpen(false)
      setForm({ ...EMPTY_FORM })
      router.refresh()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(false)
    }
  }

  function openAdd(prefillDate?: Date) {
    setForm({
      ...EMPTY_FORM,
      date: toDateInputValue(prefillDate ?? days[0]),
    })
    setAddOpen(true)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Shift Scheduler
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Weekly coverage across the maintenance team.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart((w) => addDays(w, -7))}
              className="p-1.5 rounded-md border border-border hover:bg-muted/40 text-muted-foreground"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="px-2 min-w-[160px] text-center">
              <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                {fmtDayRange(weekStart)}
              </div>
              <button
                onClick={() => setWeekStart(mondayOf(new Date()))}
                className="text-[10.5px] text-primary hover:underline"
              >
                Jump to this week
              </button>
            </div>
            <button
              onClick={() => setWeekStart((w) => addDays(w, 7))}
              className="p-1.5 rounded-md border border-border hover:bg-muted/40 text-muted-foreground"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" onClick={() => openAdd()} disabled={roster.length === 0}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Shift
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 overflow-auto p-6">
        {roster.length === 0 ? (
          <EmptyState
            title="No mechanics on the roster"
            body="Invite team members to your organization to start scheduling shifts."
          />
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            {/* Day header row */}
            <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
              <div className="px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                Mechanic
              </div>
              {days.map((d, i) => (
                <div
                  key={i}
                  className={`px-3 py-2.5 text-center border-l border-border ${
                    isToday(d) ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
                    {DAY_LABELS[i]}
                  </div>
                  <div
                    className={`text-[12px] tabular-nums ${isToday(d) ? 'text-primary' : 'text-foreground'}`}
                    style={{ fontWeight: isToday(d) ? 700 : 500 }}
                  >
                    {d.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {/* Mechanic rows */}
            <div className="divide-y divide-border">
              {roster.map((member) => {
                const color = colorFor.get(member.user_id) ?? COLORS[0]
                const row = grid.get(member.user_id) ?? []
                return (
                  <div
                    key={member.user_id}
                    className="grid min-h-[88px]"
                    style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
                  >
                    <div className="px-3 py-2.5 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${color.dot}`} />
                      <span className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>
                        {member.name}
                      </span>
                    </div>
                    {days.map((d, dayIdx) => (
                      <div
                        key={dayIdx}
                        className={`border-l border-border p-1.5 space-y-1 ${
                          isToday(d) ? 'bg-primary/5' : ''
                        }`}
                      >
                        {row[dayIdx]?.map((s) => (
                          <div
                            key={s.id}
                            className={`rounded-md border px-2 py-1 ${color.bg} ${color.border} ${color.text}`}
                          >
                            <div className="text-[11px] tabular-nums" style={{ fontWeight: 700 }}>
                              {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                            </div>
                            <div className="text-[11px] truncate">{s.name}</div>
                            {s.notes && (
                              <div className="text-[10px] opacity-70 truncate">{s.notes}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {roster.length > 0 && weekShifts.length === 0 && (
          <div className="mt-4 text-center py-10 text-sm text-muted-foreground border border-dashed border-border rounded-xl bg-white">
            No shifts scheduled for this week.{' '}
            <button onClick={() => openAdd()} className="text-primary hover:underline">
              Add one
            </button>
            .
          </div>
        )}
      </div>

      {addOpen && (
        <AddShiftModal
          form={form}
          setForm={setForm}
          roster={roster}
          saving={saving}
          onClose={() => setAddOpen(false)}
          onSubmit={createShift}
        />
      )}
    </div>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
        <CalendarDays className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground text-center max-w-sm">{body}</p>
    </div>
  )
}

function AddShiftModal({
  form,
  setForm,
  roster,
  saving,
  onClose,
  onSubmit,
}: {
  form: typeof EMPTY_FORM
  setForm: (f: typeof EMPTY_FORM) => void
  roster: RosterMember[]
  saving: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm({ ...form, [k]: v })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Add Shift</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <Field label="Mechanic *">
            <select
              value={form.technician_id}
              onChange={(e) => set('technician_id', e.target.value)}
              className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a mechanic…</option>
              {roster.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date *">
            <Text type="date" value={form.date} onChange={(v) => set('date', v)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start Time *">
              <Text type="time" value={form.start_time} onChange={(v) => set('start_time', v)} />
            </Field>
            <Field label="End Time *">
              <Text type="time" value={form.end_time} onChange={(v) => set('end_time', v)} />
            </Field>
          </div>
          <Field label="Shift Name">
            <Text value={form.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Notes">
            <Text value={form.notes} onChange={(v) => set('notes', v)} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              Add Shift
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
