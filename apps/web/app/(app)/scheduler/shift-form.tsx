'use client'

/**
 * ShiftForm — create or edit a shift (Spec 2.5.1).
 *
 * Modal with the fields the spec calls out: name, technician, roles
 * (skill tags), start/end, status, notes, and a sample checklist edit.
 * Reminders / recurring schedules are bigger surface — for v0 the
 * field is editable JSON with a structured-edit UI as a follow-up.
 */

import { useState, useMemo } from 'react'
import { X, Loader2, Plus, Trash2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Shift, ShiftStatus, ShiftChecklistItem } from '@/types'
import type { TechSummary } from './scheduler-view'

const STATUSES: Array<{ value: ShiftStatus; label: string }> = [
  { value: 'scheduled',    label: 'Scheduled' },
  { value: 'in-progress',  label: 'In progress' },
  { value: 'completed',    label: 'Completed' },
  { value: 'missed',       label: 'Missed' },
  { value: 'swapped',      label: 'Swapped' },
]

const COMMON_ROLES = ['IA', 'Avionics', 'Engine', 'Sheet Metal', 'Inspector', 'Lead']

interface Props {
  techs: TechSummary[]
  /** When provided, the form is in edit mode and pre-fills with this shift. */
  shift?: Shift | null
  onClose: () => void
  onSaved: () => void
}

function toLocalInputValue(iso: string): string {
  // <input type="datetime-local"> needs YYYY-MM-DDTHH:mm in local time
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue(local: string): string {
  return new Date(local).toISOString()
}

function defaultStart(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(8)
  return toLocalInputValue(d.toISOString())
}
function defaultEnd(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(16)
  return toLocalInputValue(d.toISOString())
}

export function ShiftForm({ techs, shift, onClose, onSaved }: Props) {
  const isEdit = !!shift

  const [name, setName] = useState(shift?.name ?? 'Morning shift')
  const [technicianId, setTechnicianId] = useState(shift?.technician_id ?? techs[0]?.id ?? '')
  const [roles, setRoles] = useState<string[]>(shift?.roles ?? [])
  const [start, setStart] = useState(shift?.start_time ? toLocalInputValue(shift.start_time) : defaultStart())
  const [end, setEnd] = useState(shift?.end_time ? toLocalInputValue(shift.end_time) : defaultEnd())
  const [status, setStatus] = useState<ShiftStatus>(shift?.status ?? 'scheduled')
  const [notes, setNotes] = useState(shift?.notes ?? '')
  const [checklist, setChecklist] = useState<ShiftChecklistItem[]>(shift?.checklist ?? [])
  const [newCheckText, setNewCheckText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const techName = useMemo(
    () => techs.find((t) => t.id === technicianId)?.full_name ?? '',
    [techs, technicianId],
  )

  function toggleRole(r: string) {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])
  }

  function addCheckItem() {
    const t = newCheckText.trim()
    if (!t) return
    setChecklist((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: t, completed: false },
    ])
    setNewCheckText('')
  }
  function removeCheckItem(id: string) {
    setChecklist((prev) => prev.filter((c) => c.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!technicianId) {
      toast.error('Pick a technician')
      return
    }
    if (!name.trim()) {
      toast.error('Shift needs a name')
      return
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      toast.error('End time must be after start time')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        technician_id: technicianId,
        roles,
        start_time: fromLocalInputValue(start),
        end_time: fromLocalInputValue(end),
        status,
        notes: notes.trim() || null,
        checklist,
      }
      const res = isEdit
        ? await fetch(`/api/shifts/${shift!.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/shifts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success(isEdit ? 'Shift updated' : 'Shift created')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!shift) return
    if (!confirm(`Delete ${shift.name}?`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/shifts/${shift.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error ?? `Failed (${res.status})`)
        return
      }
      toast.success('Shift deleted')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border bg-gradient-to-br from-[#0A1628] to-[#1E3A5F] flex items-center justify-between">
          <div>
            <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>
              {isEdit ? 'Edit shift' : 'New shift'}
            </div>
            <div className="text-[11px] text-white/60 mt-0.5">
              {techName ? `Assigned to ${techName}` : 'Pick a tech, set the window'}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Shift name
            </Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning shift" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Technician
            </Label>
            <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Select tech…</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name} · {t.role}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                Start
              </Label>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                End
              </Label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Skill tags
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_ROLES.map((r) => {
                const active = roles.includes(r)
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                    style={{ fontWeight: active ? 600 : 500 }}
                  >
                    {active && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                    {r}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Status
            </Label>
            <select value={status} onChange={(e) => setStatus(e.target.value as ShiftStatus)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Pre/post-shift checklist
            </Label>
            <div className="space-y-1.5">
              {checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-muted/20">
                  <span className="flex-1 text-[12.5px] text-foreground">{c.text}</span>
                  <button type="button" onClick={() => removeCheckItem(c.id)}
                    className="text-muted-foreground hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input
                  value={newCheckText}
                  onChange={(e) => setNewCheckText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem() } }}
                  placeholder="e.g. Inspect tow vehicle"
                />
                <Button type="button" variant="outline" onClick={addCheckItem}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Notes
            </Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Any context — clients to expect, parts to receive, etc."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex items-center justify-between gap-2">
          <div>
            {isEdit && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={submitting}
                className="text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {isEdit ? 'Save' : 'Create shift'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
