'use client'

/**
 * ContinuedItemForm (Spec 1.4) — create a continued (deferred) item.
 *
 * Caller passes the aircraft_id (per-aircraft panel) or lets the user pick
 * (org-wide page). discovered_on_work_order is optional — a deferred item
 * can also be opened outside a WO context.
 */

import { useState } from 'react'
import { Loader2, Bookmark } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ContinuedItemPriority } from '@/types'

const PRIORITY_OPTIONS: { value: ContinuedItemPriority; label: string }[] = [
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

interface AircraftLite { id: string; tail_number: string }

export function ContinuedItemForm({
  aircraftId,
  aircraftOptions,
  defaultDiscoveredWorkOrderId,
  onCreated,
  onCancel,
}: {
  /** Pre-selected aircraft. When undefined, `aircraftOptions` must be provided. */
  aircraftId?: string
  aircraftOptions?: AircraftLite[]
  defaultDiscoveredWorkOrderId?: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [pickedAircraftId, setPickedAircraftId] = useState<string>(
    aircraftId ?? aircraftOptions?.[0]?.id ?? '',
  )
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<ContinuedItemPriority>('medium')
  const [discoveredWO, setDiscoveredWO] = useState(defaultDiscoveredWorkOrderId ?? '')
  const [discoveredDate, setDiscoveredDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!pickedAircraftId) {
      toast.error('Pick an aircraft')
      return
    }
    if (!description.trim()) {
      toast.error('Describe the deferred item')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/continued-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: pickedAircraftId,
          description: description.trim(),
          priority,
          discovered_on_work_order: discoveredWO.trim() || null,
          discovered_date: discoveredDate,
          notes: notes.trim() || null,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Failed to create item')
        return
      }
      toast.success('Continued item logged')
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          New continued item
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Aircraft">
          {aircraftOptions ? (
            <select
              value={pickedAircraftId}
              onChange={(e) => setPickedAircraftId(e.target.value)}
              className={inputCls}
            >
              {aircraftOptions.length === 0 && <option value="">No aircraft</option>}
              {aircraftOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.tail_number || '(unnamed)'}</option>
              ))}
            </select>
          ) : (
            <input
              value={pickedAircraftId}
              disabled
              className={`${inputCls} font-mono opacity-70`}
            />
          )}
        </Field>
        <Field label="Priority">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as ContinuedItemPriority)}
            className={inputCls}
          >
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Cracked baffle on cylinder 3 — order replacement and install at next inspection."
          className={`${inputCls} resize-none`}
          rows={2}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Discovered on (WO id, optional)">
          <input
            value={discoveredWO}
            onChange={(e) => setDiscoveredWO(e.target.value)}
            placeholder="Work order UUID"
            className={`${inputCls} font-mono`}
          />
        </Field>
        <Field label="Discovered date">
          <input
            type="date"
            value={discoveredDate}
            onChange={(e) => setDiscoveredDate(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="parts on order, scheduling constraints, owner approval status..."
          className={`${inputCls} resize-none`}
          rows={2}
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Log item
        </Button>
      </div>
    </form>
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
