'use client'

/**
 * PurchaseOrderForm (Spec 2.1) — create a PO. po_number generates server-side.
 *
 * Lines pick from existing inventory_parts in this org (creating the part
 * is a separate flow on /parts).
 */

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { InventoryPart } from '@/types'

interface DraftLine {
  inventory_part_id: string
  qty_ordered: string
  unit_cost: string
}

function emptyLine(parts: InventoryPart[]): DraftLine {
  return {
    inventory_part_id: parts[0]?.id ?? '',
    qty_ordered: '1',
    unit_cost: parts[0] ? String(parts[0].unit_cost) : '0',
  }
}

export function PurchaseOrderForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const [parts, setParts] = useState<InventoryPart[]>([])
  const [partsLoading, setPartsLoading] = useState(true)
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [requestedDate, setRequestedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<DraftLine[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadParts() {
      try {
        const res = await fetch('/api/inventory-parts?limit=500', { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json()
        if (cancelled) return
        const partsList = (payload.parts ?? []) as InventoryPart[]
        setParts(partsList)
        setLines([emptyLine(partsList)])
      } finally {
        if (!cancelled) setPartsLoading(false)
      }
    }
    loadParts()
    return () => { cancelled = true }
  }, [])

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!vendor.trim()) { toast.error('Vendor required'); return }
    if (lines.length === 0) { toast.error('At least one line required'); return }
    for (const l of lines) {
      if (!l.inventory_part_id) { toast.error('Each line needs a part'); return }
      const q = Number(l.qty_ordered)
      if (!Number.isFinite(q) || q <= 0) { toast.error('qty must be > 0'); return }
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor: vendor.trim(),
          description: description.trim() || null,
          requested_date: requestedDate,
          lines: lines.map((l, i) => ({
            inventory_part_id: l.inventory_part_id,
            qty_ordered: Number(l.qty_ordered),
            unit_cost: Number(l.unit_cost) || 0,
            sort_order: i,
          })),
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Create failed')
        return
      }
      toast.success(`PO ${out?.purchase_order?.po_number ?? 'created'}`)
      onCreated(out?.purchase_order?.id ?? '')
    } finally {
      setSubmitting(false)
    }
  }

  if (partsLoading) {
    return (
      <div className="bg-white rounded-2xl border border-border p-5 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (parts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-border p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          No parts in inventory yet. Create at least one part on /parts before opening a PO.
        </p>
        <Button onClick={onCancel} variant="ghost" className="mt-3">Cancel</Button>
      </div>
    )
  }

  const total = lines.reduce(
    (s, l) => s + (Number(l.qty_ordered) || 0) * (Number(l.unit_cost) || 0),
    0,
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          New purchase order
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Vendor">
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Aircraft Spruce" className={inputCls} />
        </Field>
        <Field label="Requested date">
          <input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Optional context for this order" />
      </Field>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Lines
          </span>
          <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine(parts)])} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline" style={{ fontWeight: 500 }}>
            <Plus className="h-3 w-3" /> Add line
          </button>
        </div>
        <ul className="space-y-2">
          {lines.map((l, i) => (
            <li key={i} className="grid grid-cols-1 md:grid-cols-[1fr,100px,120px,auto] gap-2 items-end rounded-xl border border-border p-2.5 bg-muted/10">
              <Field label="Part">
                <select
                  value={l.inventory_part_id}
                  onChange={(e) => {
                    const next = parts.find((p) => p.id === e.target.value)
                    updateLine(i, {
                      inventory_part_id: e.target.value,
                      unit_cost: next ? String(next.unit_cost) : l.unit_cost,
                    })
                  }}
                  className={inputCls}
                >
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.part_number} — {p.description.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Qty">
                <input type="number" min="0.01" step="0.01" value={l.qty_ordered} onChange={(e) => updateLine(i, { qty_ordered: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Unit cost">
                <input type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: e.target.value })} className={inputCls} />
              </Field>
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={lines.length === 1}
                className="p-2 rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 mb-0.5"
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        <span className="text-[12px] text-muted-foreground">
          Approximate cost <span className="text-foreground font-mono" style={{ fontWeight: 700 }}>${total.toFixed(2)}</span>
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
            Save draft
          </Button>
        </div>
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
