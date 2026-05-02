'use client'

/**
 * ApprovalForm (Spec 1.5) — build an approval request from one or more
 * line items. Optionally seeded with work_order_id / aircraft_id /
 * customer_id when launched from a work order.
 *
 * Mechanic+ on the operator side. Saves as 'draft'; the dedicated /send
 * endpoint flips status to 'sent' and returns the public URL.
 */

import { useState } from 'react'
import { Plus, Trash2, Loader2, Mailbox } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface DraftLineItem {
  description: string
  estimated_cost: string
  labor_hours: string
  parts_cost: string
}

interface AircraftLite { id: string; tail_number: string }
interface CustomerLite { id: string; name: string }

function emptyLine(): DraftLineItem {
  return { description: '', estimated_cost: '', labor_hours: '', parts_cost: '' }
}

export function ApprovalForm({
  aircraftOptions,
  customerOptions,
  defaultAircraftId,
  defaultCustomerId,
  defaultWorkOrderId,
  onCreated,
  onCancel,
}: {
  aircraftOptions: AircraftLite[]
  customerOptions: CustomerLite[]
  defaultAircraftId?: string
  defaultCustomerId?: string
  defaultWorkOrderId?: string
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const [aircraftId, setAircraftId] = useState<string>(defaultAircraftId ?? aircraftOptions[0]?.id ?? '')
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? customerOptions[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [items, setItems] = useState<DraftLineItem[]>([emptyLine()])
  const [submitting, setSubmitting] = useState(false)

  function updateItem(idx: number, patch: Partial<DraftLineItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function addItem() { setItems((prev) => [...prev, emptyLine()]) }
  function removeItem(idx: number) { setItems((prev) => prev.filter((_, i) => i !== idx)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0 || items.some((it) => !it.description.trim())) {
      toast.error('Each line item needs a description')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/approval-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id: defaultWorkOrderId ?? null,
          aircraft_id: aircraftId || null,
          customer_id: customerId || null,
          subject: subject.trim() || null,
          message: message.trim() || null,
          expires_at: expiresAt || null,
          line_items: items.map((it, i) => ({
            description: it.description.trim(),
            estimated_cost: numericOrZero(it.estimated_cost),
            labor_hours:    numericOrZero(it.labor_hours),
            parts_cost:     numericOrZero(it.parts_cost),
            sort_order: i,
          })),
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Failed to create approval request')
        return
      }
      toast.success('Draft created')
      onCreated(out?.request?.id ?? '')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Mailbox className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          New approval request
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Aircraft">
          <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className={inputCls}>
            <option value="">— none —</option>
            {aircraftOptions.map((a) => <option key={a.id} value={a.id}>{a.tail_number || '(unnamed)'}</option>)}
          </select>
        </Field>
        <Field label="Customer">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
            <option value="">— none —</option>
            {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Subject">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Annual inspection — proposed scope" className={inputCls} />
      </Field>
      <Field label="Message" hint="Shown to the customer above the line items.">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputCls} resize-none`} rows={3} />
      </Field>
      <Field label="Expires at (optional)">
        <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
      </Field>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Line items
          </span>
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline" style={{ fontWeight: 500 }}>
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="rounded-xl border border-border p-3 bg-muted/10 space-y-2">
              <textarea
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                placeholder="What needs doing? Parts, labor, why."
                className={`${inputCls} resize-none`}
                rows={2}
              />
              <div className="grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,auto] gap-2 items-end">
                <Field label="Labor hours">
                  <input type="number" step="0.1" min="0" value={it.labor_hours} onChange={(e) => updateItem(i, { labor_hours: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Parts cost ($)">
                  <input type="number" step="0.01" min="0" value={it.parts_cost} onChange={(e) => updateItem(i, { parts_cost: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Total estimate ($)">
                  <input type="number" step="0.01" min="0" value={it.estimated_cost} onChange={(e) => updateItem(i, { estimated_cost: e.target.value })} className={inputCls} />
                </Field>
                <button type="button" onClick={() => removeItem(i)} disabled={items.length === 1} className="p-2 rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Save draft
        </Button>
      </div>
    </form>
  )
}

function numericOrZero(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
      {hint && <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">{hint}</div>}
    </div>
  )
}
