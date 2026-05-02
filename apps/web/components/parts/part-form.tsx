'use client'

/**
 * PartForm (Spec 2.1) — create/edit an inventory part.
 *
 * Used inline on PartsInventoryView. Edit mode is by `initial`; the form
 * does a full replacement of the part's editable fields on save.
 */

import { useState } from 'react'
import { Loader2, Package, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { InventoryPart, PartClass } from '@/types'

const PART_CLASSES: { value: PartClass; label: string }[] = [
  { value: 'consumable', label: 'Consumable' },
  { value: 'rotable',    label: 'Rotable' },
  { value: 'serialized', label: 'Serialized' },
]

export function PartForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: InventoryPart
  onSaved: () => void
  onCancel: () => void
}) {
  const editing = !!initial
  const [partNumber, setPartNumber] = useState(initial?.part_number ?? '')
  const [altPartNumbers, setAltPartNumbers] = useState((initial?.alt_part_numbers ?? []).join(', '))
  const [description, setDescription] = useState(initial?.description ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [partClass, setPartClass] = useState<PartClass>(initial?.part_class ?? 'consumable')
  const [qtyOnHand, setQtyOnHand] = useState(String(initial?.qty_on_hand ?? '0'))
  const [minOnHand, setMinOnHand] = useState(String(initial?.min_on_hand ?? '0'))
  const [unitCost, setUnitCost] = useState(String(initial?.unit_cost ?? '0'))
  const [unitPrice, setUnitPrice] = useState(String(initial?.unit_price ?? '0'))
  const [vendor, setVendor] = useState(initial?.vendor ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [alertEmails, setAlertEmails] = useState((initial?.alert_emails ?? []).join(', '))
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!partNumber.trim()) { toast.error('Part number required'); return }
    if (!description.trim()) { toast.error('Description required'); return }
    setSubmitting(true)
    try {
      const payload = {
        part_number: partNumber.trim(),
        alt_part_numbers: altPartNumbers.split(',').map((s) => s.trim()).filter(Boolean),
        description: description.trim(),
        category: category.trim() || null,
        part_class: partClass,
        qty_on_hand: numericOrZero(qtyOnHand),
        min_on_hand: numericOrZero(minOnHand),
        unit_cost: numericOrZero(unitCost),
        unit_price: numericOrZero(unitPrice),
        vendor: vendor.trim() || null,
        location: location.trim() || null,
        alert_emails: alertEmails.split(',').map((s) => s.trim()).filter(Boolean),
      }
      const url = editing ? `/api/inventory-parts/${initial!.id}` : '/api/inventory-parts'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Part updated' : 'Part added')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          {editing ? `Edit part — ${initial!.part_number}` : 'New part'}
        </h3>
        <button type="button" onClick={onCancel} className="ml-auto p-1 rounded-md hover:bg-muted text-muted-foreground" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Part number">
          <input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="SP-12345" className={inputCls} />
        </Field>
        <Field label="Class">
          <select value={partClass} onChange={(e) => setPartClass(e.target.value as PartClass)} className={inputCls}>
            {PART_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" className={inputCls} />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Alt part numbers" hint="Comma-separated">
          <input value={altPartNumbers} onChange={(e) => setAltPartNumbers(e.target.value)} placeholder="SP-12345-A, ALT-9876" className={inputCls} />
        </Field>
        <Field label="Category">
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Filters / hardware / fluids …" className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Qty on hand">
          <input type="number" min="0" step="0.01" value={qtyOnHand} onChange={(e) => setQtyOnHand(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Min on hand" hint="reorder threshold">
          <input type="number" min="0" step="0.01" value={minOnHand} onChange={(e) => setMinOnHand(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Unit cost">
          <input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Unit price">
          <input type="number" min="0" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Vendor">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Aircraft Spruce" className={inputCls} />
        </Field>
        <Field label="Location" hint="shelf / bin / room">
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Shelf A-3" className={inputCls} />
        </Field>
      </div>

      <Field label="Low-stock alert emails" hint="Comma-separated. Sprint 0d delivery once SendGrid lands.">
        <input value={alertEmails} onChange={(e) => setAlertEmails(e.target.value)} placeholder="purchasing@shop.com, lead@shop.com" className={inputCls} />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          {editing ? 'Save changes' : 'Add part'}
        </Button>
      </div>
    </form>
  )
}

function numericOrZero(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
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
