'use client'

/**
 * ComplianceItemForm (Spec 1.2) — create a compliance item.
 *
 * Caller passes the active aircraft_id (we don't pick aircraft inside the
 * form; the per-aircraft panel passes its own id, and the global page
 * picks first). Whichever-comes-first behavior: the user can fill any
 * combination of calendar / hours / cycles intervals.
 *
 * Edit-mode is intentionally minimal in this form — full edit flows live
 * inline on the AircraftCompliancePanel rows. This is the create flow.
 */

import { useState } from 'react'
import { Loader2, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ComplianceItemType, ComplianceSource } from '@/types'

const TYPE_OPTIONS: { value: ComplianceItemType; label: string }[] = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'component',  label: 'Component' },
]

const SOURCE_OPTIONS: { value: ComplianceSource; label: string }[] = [
  { value: 'Custom',        label: 'Custom' },
  { value: 'Manufacturer',  label: 'Manufacturer' },
  { value: 'AD',            label: 'AD' },
  { value: 'SB',            label: 'SB' },
  { value: 'Life-Limited',  label: 'Life-Limited' },
]

export function ComplianceItemForm({
  aircraftId,
  onCreated,
  onCancel,
}: {
  aircraftId: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [itemType, setItemType] = useState<ComplianceItemType>('inspection')
  const [source, setSource] = useState<ComplianceSource>('Custom')
  const [sourceReference, setSourceReference] = useState('')

  const [calMonths, setCalMonths] = useState('')
  const [intervalHours, setIntervalHours] = useState('')
  const [intervalCycles, setIntervalCycles] = useState('')
  const [tolDays, setTolDays] = useState('')
  const [tolHours, setTolHours] = useState('')

  const [lastDate, setLastDate] = useState('')
  const [lastHours, setLastHours] = useState('')
  const [lastCycles, setLastCycles] = useState('')

  const [requiresRii, setRequiresRii] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!calMonths && !intervalHours && !intervalCycles) {
      toast.error('Set at least one interval (calendar months, hours, or cycles)')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/compliance-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          title: title.trim(),
          item_type: itemType,
          source,
          source_reference: sourceReference.trim() || null,
          interval_calendar_months: calMonths || null,
          interval_hours:           intervalHours || null,
          interval_cycles:          intervalCycles || null,
          tolerance_calendar_days:  tolDays || null,
          tolerance_hours:          tolHours || null,
          last_completed_date:      lastDate  || null,
          last_completed_hours:     lastHours || null,
          last_completed_cycles:    lastCycles || null,
          requires_rii: requiresRii,
          notes: notes.trim() || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Failed to create item')
        return
      }
      toast.success(`Created "${title.trim()}"`)
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          New compliance item
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Inspection"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type">
            <select value={itemType} onChange={(e) => setItemType(e.target.value as ComplianceItemType)} className={inputCls}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value as ComplianceSource)} className={inputCls}>
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {(source === 'AD' || source === 'SB') && (
        <Field label={`${source} reference`}>
          <input
            type="text"
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            placeholder={source === 'AD' ? 'e.g. AD 2023-12-05' : 'e.g. SB 2024-01'}
            className={inputCls}
          />
        </Field>
      )}

      <div className="border-t border-border pt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Interval (calendar months)" hint="e.g. 12 for annual">
          <input type="number" min="1" value={calMonths} onChange={(e) => setCalMonths(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Interval (hours)" hint="e.g. 100 for 100hr">
          <input type="number" step="0.1" min="0" value={intervalHours} onChange={(e) => setIntervalHours(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Interval (cycles)">
          <input type="number" min="1" value={intervalCycles} onChange={(e) => setIntervalCycles(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Tolerance (days)" hint="grace period beyond calendar due">
          <input type="number" min="0" value={tolDays} onChange={(e) => setTolDays(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Tolerance (hours)" hint="grace period beyond hours due">
          <input type="number" step="0.1" min="0" value={tolHours} onChange={(e) => setTolHours(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="border-t border-border pt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Last completed (date)">
          <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Last completed (hours)">
          <input type="number" step="0.1" min="0" value={lastHours} onChange={(e) => setLastHours(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Last completed (cycles)">
          <input type="number" min="0" value={lastCycles} onChange={(e) => setLastCycles(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label="Notes">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
      </Field>

      <label className="inline-flex items-center gap-2 text-[12.5px] text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={requiresRii}
          onChange={(e) => setRequiresRii(e.target.checked)}
          className="rounded border-border"
        />
        <span>Requires RII (Required Inspection Item — second mechanic signoff)</span>
      </label>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Create item
        </Button>
      </div>
    </form>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

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
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
      {hint && (
        <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">{hint}</div>
      )}
    </div>
  )
}
