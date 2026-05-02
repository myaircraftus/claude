'use client'

/**
 * PurchaseOrdersView (Spec 2.1) — operator-side PO list with status filter
 * + inline create.
 */

import { useEffect, useState } from 'react'
import { Plus, Loader2, ShoppingCart, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PurchaseOrderForm } from './po-form'
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, OrgRole } from '@/types'

type FullPO = PurchaseOrder & { lines: PurchaseOrderLine[] }

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
  'open-request': 'Open',
  ordered: 'Ordered',
  'partially-fulfilled': 'Partial',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
}

export function PurchaseOrdersView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [pos, setPos] = useState<FullPO[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrderStatus>('all')

  async function load() {
    try {
      const res = await fetch('/api/purchase-orders?limit=200', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setPos((payload.purchase_orders ?? []) as FullPO[])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = statusFilter === 'all' ? pos : pos.filter((p) => p.status === statusFilter)
  const counts = (Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).reduce<Record<PurchaseOrderStatus, number>>(
    (acc, s) => { acc[s] = pos.filter((p) => p.status === s).length; return acc },
    { draft: 0, 'open-request': 0, ordered: 0, 'partially-fulfilled': 0, fulfilled: 0, cancelled: 0 },
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Purchase orders
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Order parts, track receipt. Fulfilling a PO line increments the linked
            inventory part's qty on hand automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/parts" className="text-[12px] text-muted-foreground hover:text-foreground" style={{ fontWeight: 500 }}>
            ← Inventory
          </Link>
          {canMutate && !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New PO
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <PurchaseOrderForm
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All ({pos.length})
        </FilterChip>
        {(Object.keys(STATUS_LABEL) as PurchaseOrderStatus[]).map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {STATUS_LABEL[s]}
            <span className="ml-1 text-muted-foreground/70">({counts[s]})</span>
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            {statusFilter === 'all' ? 'No purchase orders yet' : 'Nothing in this status'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {filtered.map((po) => {
              const totalReceived = po.lines.reduce((s, l) => s + Number(l.qty_received), 0)
              const totalOrdered = po.lines.reduce((s, l) => s + Number(l.qty_ordered), 0)
              return (
                <motion.li
                  key={po.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-white rounded-2xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <Link href={`/purchase-orders/${po.id}`} className="flex items-center gap-3 p-4 group">
                    <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', STATUS_TINT[po.status])}>
                      <ShoppingCart className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] text-foreground font-mono" style={{ fontWeight: 700 }}>
                          {po.po_number}
                        </span>
                        <span className="text-[13px] text-muted-foreground">{po.vendor}</span>
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[po.status])} style={{ fontWeight: 700 }}>
                          {STATUS_LABEL[po.status]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{po.lines.length} line{po.lines.length === 1 ? '' : 's'}</span>
                        <span>· {totalReceived.toFixed(0)} / {totalOrdered.toFixed(0)} received</span>
                        <span>· <span className="font-mono">${Number(po.approximate_cost).toFixed(2)}</span></span>
                        <span>· requested {po.requested_date}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-[11.5px] border transition-colors',
        active ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted',
      )}
      style={{ fontWeight: 500 }}
    >
      {children}
    </button>
  )
}
