'use client'

/**
 * MeterProfileForm — create a meter profile + its initial meter definitions
 * (Spec 1.1). Inline form, single POST → /api/meter-profiles.
 *
 * Edit mode for existing profiles uses /api/meter-profiles/[id] PATCH for
 * name/description; reordering / adding / removing meter definitions
 * after creation is a future sprint (logged as a follow-up).
 */

import { useState } from 'react'
import { Plus, Trash2, Loader2, Gauge } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MeterUnit } from '@/types'

interface DraftMeter {
  name: string
  unit: MeterUnit
  decimal_places: number
}

const DEFAULT_METERS: DraftMeter[] = [
  { name: 'Hobbs', unit: 'hours',  decimal_places: 1 },
  { name: 'Tach',  unit: 'hours',  decimal_places: 1 },
]

const UNIT_OPTIONS: { value: MeterUnit; label: string }[] = [
  { value: 'hours',    label: 'Hours' },
  { value: 'cycles',   label: 'Cycles' },
  { value: 'landings', label: 'Landings' },
  { value: 'minutes',  label: 'Minutes' },
  { value: 'starts',   label: 'Starts' },
]

export function MeterProfileForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [meters, setMeters] = useState<DraftMeter[]>(DEFAULT_METERS)
  const [submitting, setSubmitting] = useState(false)

  function updateMeter(idx: number, patch: Partial<DraftMeter>) {
    setMeters((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  }

  function addMeter() {
    setMeters((prev) => [...prev, { name: '', unit: 'hours', decimal_places: 1 }])
  }

  function removeMeter(idx: number) {
    setMeters((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    if (meters.length === 0 || meters.some((m) => !m.name.trim())) {
      toast.error('Each meter needs a name')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meter-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          meters: meters.map((m, i) => ({ ...m, name: m.name.trim(), sort_order: i })),
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Failed to create profile')
        return
      }
      toast.success(`Profile "${name.trim()}" created`)
      onCreated()
    } catch {
      toast.error('Failed to create profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          New meter profile
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Piston Single"
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Cessna / Piper / Beech tracking"
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
            Meters
          </span>
          <button
            type="button"
            onClick={addMeter}
            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            style={{ fontWeight: 500 }}
          >
            <Plus className="h-3 w-3" /> Add meter
          </button>
        </div>

        <ul className="mt-2 space-y-1.5">
          {meters.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={m.name}
                onChange={(e) => updateMeter(i, { name: e.target.value })}
                placeholder="Meter name"
                className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
              />
              <select
                value={m.unit}
                onChange={(e) => updateMeter(i, { unit: e.target.value as MeterUnit })}
                className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
              <select
                value={m.decimal_places}
                onChange={(e) => updateMeter(i, { decimal_places: parseInt(e.target.value, 10) })}
                className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
                title="Decimal precision"
              >
                {[0, 1, 2, 3].map((d) => (
                  <option key={d} value={d}>{`${d}.dp`}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeMeter(i)}
                disabled={meters.length === 1}
                className={cn(
                  'p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
                  meters.length === 1 && 'opacity-40 cursor-not-allowed',
                )}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Create profile
        </Button>
      </div>
    </form>
  )
}
