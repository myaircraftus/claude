'use client'

/**
 * MeterReadingForm — log a new meter reading for an aircraft (Spec 1.1).
 *
 * Compact inline form. Caller passes the meter definitions on the
 * aircraft's profile (already-fetched by AircraftMeterPanel) so the
 * dropdown is populated without a second round-trip.
 *
 * On success: emits a `meter-reading` AISignal via /api/meter-readings POST
 * (closes Sprint 0c follow-up — see API route header).
 */

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { MeterDefinition } from '@/types'

export function MeterReadingForm({
  aircraftId,
  definitions,
  onCreated,
}: {
  aircraftId: string
  definitions: MeterDefinition[]
  onCreated: () => void
}) {
  const [meterId, setMeterId] = useState<string>(definitions[0]?.id ?? '')
  const [value, setValue] = useState<string>('')
  const [readingDate, setReadingDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  if (definitions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
        <p className="text-[12px] text-muted-foreground">
          Assign a meter profile to this aircraft before logging readings.
        </p>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!meterId) {
      toast.error('Pick a meter')
      return
    }
    const numericValue = Number(value)
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      toast.error('Value must be a non-negative number')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meter-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          meter_definition_id: meterId,
          value: numericValue,
          reading_date: readingDate,
          source: 'manual',
          notes: notes.trim() || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Failed to log reading')
        return
      }
      toast.success('Reading logged')
      setValue('')
      setNotes('')
      onCreated()
    } catch {
      toast.error('Failed to log reading')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,1fr,auto] gap-2 items-end"
    >
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
          Meter
        </label>
        <select
          value={meterId}
          onChange={(e) => setMeterId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        >
          {definitions.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
          Value
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 1234.5"
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
          Date
        </label>
        <input
          type="date"
          value={readingDate}
          onChange={(e) => setReadingDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
          Notes (optional)
        </label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="post-flight, etc."
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
      </div>
      <Button type="submit" disabled={submitting} className="md:mb-0">
        {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Plus className="h-3 w-3 mr-1.5" />}
        Log
      </Button>
    </form>
  )
}
