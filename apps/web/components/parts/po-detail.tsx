'use client'

/**
 * PurchaseOrderDetail (Spec 2.1) — operator-side detail view.
 * - Header: vendor, po_number, status pill, totals
 * - Status transitions (open-request, ordered, cancelled) via PATCH
 * - Lines: per-line "receive N" form. POSTs to /fulfill which increments
 *   inventory.qty_on_hand via the shared restock helper.
 *
 * "Fulfill" auto-flow is the spec's headline acceptance for 2.1.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ShoppingCart, Loader2, Truck, CheckCircle2, X, ArrowDownToLine, Package,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, OrgRole,
} from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const STATUS_TINT: Record<PurchaseOrderStatus, string> = {
  draft:                 'bg-slate-100 text-slate-600 border-slate-200',
  'open-request':        'bg-blue-50 text-blue-700 border-blue-200',
  ordered:               'bg-violet-50 text-violet-700 border-violet-200',
  'partially-fulfilled': 'bg-amber-50 text-amber-700 border-amber-200',
  fulfilled:             'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:             'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  'open-request': 'Open request',
  ordered: 'Ordered',
  'partially-fulfilled': 'Partially fulfilled',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
}

interface LineWithPart extends PurchaseOrderLine {
  part?: {
    id: string
    part_number: string
    description: string
    unit_cost: number
    qty_on_hand: number
    min_on_hand: number
  }
}

interface DetailData {
  purchase_order: PurchaseOrder & { lines: LineWithPart[] }
}

export function PurchaseOrderDetail({
  poId,
  userRole,
}: {
  poId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Per-line "receive now" draft inputs.
  const [receiveDraft, setReceiveDraft] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as DetailData)
    } finally {
      setLoading(false)
    }
  }, [poId])

  useEffect(() => { refresh() }, [refresh])

  async function patchStatus(status: PurchaseOrderStatus) {
    setBusy(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Update failed'); return }
      toast.success(`Status: ${STATUS_LABEL[status]}`)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function fulfill(lineId: string) {
    const raw = receiveDraft[lineId]
    const qty = Number(raw)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('qty must be > 0'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts: [{ line_id: lineId, qty_received_now: qty }] }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Fulfill failed'); return }
      toast.success(`Received ${qty} — inventory updated`)
      setReceiveDraft((d) => ({ ...d, [lineId]: '' }))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function fulfillAll() {
    if (!data) return
    const remaining = data.purchase_order.lines.filter((l) => Number(l.qty_received) < Number(l.qty_ordered))
    if (remaining.length === 0) { toast.info('Nothing left to receive'); return }
    if (!confirm(`Mark all remaining lines fully received? This increments inventory by the outstanding qty on each line.`)) return
    setBusy(true)
    try {
      const receipts = remaining.map((l) => ({
        line_id: l.id,
        qty_received_now: Number(l.qty_ordered) - Number(l.qty_received),
      }))
      const res = await fetch(`/api/purchase-orders/${poId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipts }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Fulfill failed'); return }
      toast.success('All lines received — inventory updated')
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">PO not found.</p>
      </div>
    )
  }

  const po = data.purchase_order
  const allReceived = po.lines.every((l) => Number(l.qty_received) >= Number(l.qty_ordered))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[16px] text-foreground font-mono" style={{ fontWeight: 700 }}>
                {po.po_number}
              </h2>
              <span className="text-[14px] text-muted-foreground">{po.vendor}</span>
              <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[po.status])} style={{ fontWeight: 700 }}>
                {STATUS_LABEL[po.status]}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground flex items-center gap-2 flex-wrap">
              <span>requested {po.requested_date}</span>
              {po.ordered_date && <span>· ordered {po.ordered_date}</span>}
              {po.fulfilled_date && <span>· fulfilled {po.fulfilled_date}</span>}
              <span>· <span className="font-mono">${Number(po.approximate_cost).toFixed(2)}</span></span>
            </div>
            {po.description && (
              <p className="mt-2 text-[12.5px] text-muted-foreground whitespace-pre-line">{po.description}</p>
            )}
          </div>

          {canMutate && po.status !== 'cancelled' && po.status !== 'fulfilled' && (
            <div className="flex items-center gap-2">
              {po.status === 'draft' && (
                <Button size="sm" onClick={() => patchStatus('open-request')} disabled={busy}>
                  Submit
                </Button>
              )}
              {(po.status === 'open-request' || po.status === 'draft') && (
                <Button size="sm" variant="outline" onClick={() => patchStatus('ordered')} disabled={busy}>
                  <Truck className="h-3 w-3 mr-1.5" />
                  Mark ordered
                </Button>
              )}
              {!allReceived && po.status !== 'draft' && (
                <Button size="sm" onClick={fulfillAll} disabled={busy}>
                  <CheckCircle2 className="h-3 w-3 mr-1.5" />
                  Fulfill all
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => patchStatus('cancelled')} disabled={busy}>
                <X className="h-3 w-3 mr-1.5" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <ul className="space-y-2">
        <AnimatePresence>
          {po.lines.map((line) => {
            const ordered = Number(line.qty_ordered)
            const received = Number(line.qty_received)
            const remaining = Math.max(0, ordered - received)
            const fullyReceived = remaining === 0
            const draft = receiveDraft[line.id] ?? (remaining > 0 ? String(remaining) : '')
            return (
              <motion.li
                key={line.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn('bg-white rounded-2xl border border-border p-4', fullyReceived && 'opacity-80')}
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="w-9 h-9 rounded-xl border bg-muted/40 border-border flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] text-foreground font-mono" style={{ fontWeight: 700 }}>
                        {line.part?.part_number ?? line.inventory_part_id.slice(0, 8)}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground truncate">
                        {line.part?.description ?? '(part removed)'}
                      </span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>
                        <span className="font-mono" style={{ fontWeight: 600 }}>{received.toFixed(0)}</span>
                        {' '}of <span className="font-mono">{ordered.toFixed(0)}</span> received
                      </span>
                      <span>· <span className="font-mono">${Number(line.unit_cost).toFixed(2)}</span> ea</span>
                      {line.part && (
                        <span>· current on-hand <span className="font-mono">{Number(line.part.qty_on_hand).toFixed(0)}</span></span>
                      )}
                      {line.notes && <span>· {line.notes}</span>}
                    </div>
                  </div>

                  {canMutate && !fullyReceived && po.status !== 'cancelled' && po.status !== 'draft' && (
                    <div className="flex items-end gap-2 shrink-0">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                          Receive now
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={draft}
                          onChange={(e) => setReceiveDraft((d) => ({ ...d, [line.id]: e.target.value }))}
                          className="mt-1 w-24 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary"
                        />
                      </div>
                      <Button size="sm" onClick={() => fulfill(line.id)} disabled={busy}>
                        <ArrowDownToLine className="h-3 w-3 mr-1.5" />
                        Receive
                      </Button>
                    </div>
                  )}
                  {fullyReceived && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full self-center" style={{ fontWeight: 700 }}>
                      <CheckCircle2 className="h-2.5 w-2.5" /> Received
                    </span>
                  )}
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}
