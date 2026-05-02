'use client'

/**
 * PartsInventoryView (Spec 2.1) — local inventory list with stat tiles,
 * search, low-stock filter, and inline create / edit / consume / restock.
 *
 * Distinct from /maintenance?tab=parts (legacy localStorage-backed PartsSection).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Package, Plus, Loader2, AlertTriangle, Trash2, Pencil,
  Minus, ArrowDownToLine,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PartForm } from './part-form'
import type { InventoryPart, OrgRole } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const CLASS_TINT: Record<InventoryPart['part_class'], string> = {
  consumable: 'bg-blue-50 text-blue-700 border-blue-200',
  rotable:    'bg-violet-50 text-violet-700 border-violet-200',
  serialized: 'bg-amber-50 text-amber-700 border-amber-200',
}

export function PartsInventoryView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [parts, setParts] = useState<InventoryPart[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (showLowOnly) params.set('low_stock', '1')
      const res = await fetch(`/api/inventory-parts?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setParts((payload.parts ?? []) as InventoryPart[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, showLowOnly])

  async function archive(id: string, partNumber: string) {
    if (!confirm(`Archive part "${partNumber}"?`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/inventory-parts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Could not archive')
        return
      }
      toast.success('Archived')
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function quickConsume(id: string, n: number = 1) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/inventory-parts/${id}/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: n, source_kind: 'manual' }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Consume failed'); return }
      if (out?.flipped_low_stock) {
        toast.warning(`${out?.part?.part_number ?? 'Part'} now at low-stock`)
      } else {
        toast.success(`Consumed ${n}`)
      }
      if (out?.shortfall > 0) {
        toast.warning(`Short ${out.shortfall} (clamped at zero)`)
      }
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function quickRestock(id: string, n: number = 1) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/inventory-parts/${id}/restock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: n }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out?.error || 'Restock failed'); return }
      if (out?.cleared_low_stock) {
        toast.success('Restocked — low-stock cleared')
      } else {
        toast.success(`Restocked ${n}`)
      }
      load()
    } finally {
      setBusyId(null)
    }
  }

  const totalValue = useMemo(
    () => parts.reduce((s, p) => s + Number(p.qty_on_hand) * Number(p.unit_cost), 0),
    [parts],
  )
  const lowCount = parts.filter((p) => Number(p.qty_on_hand) <= Number(p.min_on_hand)).length

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Parts Inventory
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Local shop inventory. Decrement on use, increment when POs arrive.
            Low-stock parts surface as AI Inbox cards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/purchase-orders"
            className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            style={{ fontWeight: 500 }}
          >
            <ArrowDownToLine className="h-3 w-3" />
            Purchase orders
          </Link>
          {canMutate && !creating && !editingId && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New part
            </Button>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Parts" value={parts.length.toLocaleString()} tint="bg-blue-50 text-blue-700 border-blue-200" />
        <Stat label="Low stock" value={lowCount.toLocaleString()} tint={lowCount > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200'} />
        <Stat label="Inventory value" value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tint="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <Stat label="Categories" value={new Set(parts.map((p) => p.category).filter(Boolean)).size.toString()} tint="bg-slate-100 text-slate-700 border-slate-200" />
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by part number or description…"
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
        <button
          onClick={() => setShowLowOnly((x) => !x)}
          className={cn(
            'px-3 py-2 rounded-lg text-[12px] border transition-colors inline-flex items-center gap-1.5',
            showLowOnly
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-white text-muted-foreground border-border hover:bg-muted',
          )}
          style={{ fontWeight: 500 }}
        >
          <AlertTriangle className="h-3 w-3" />
          Low stock only
        </button>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <PartForm
              onCancel={() => setCreating(false)}
              onSaved={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : parts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {showLowOnly ? 'Nothing in low stock' : (search ? 'No matches' : 'No parts yet')}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            {showLowOnly
              ? 'Healthy inventory levels.'
              : search
              ? 'Try a different query or clear the filter.'
              : 'Add your first part to start tracking inventory.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {parts.map((p) => {
              const editing = editingId === p.id
              const low = Number(p.qty_on_hand) <= Number(p.min_on_hand)
              const busy = busyId === p.id
              return (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    'bg-white rounded-2xl border p-4',
                    low ? 'border-rose-200' : 'border-border',
                  )}
                >
                  {editing ? (
                    <PartForm
                      initial={p}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); load() }}
                    />
                  ) : (
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', CLASS_TINT[p.part_class])}>
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] text-foreground font-mono" style={{ fontWeight: 700 }}>
                            {p.part_number}
                          </span>
                          <span className="text-[13px] text-muted-foreground truncate">{p.description}</span>
                          <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', CLASS_TINT[p.part_class])} style={{ fontWeight: 700 }}>
                            {p.part_class}
                          </span>
                          {low && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Low
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
                          <span>
                            <span className={cn('font-mono', low && 'text-rose-700', low && '')} style={{ fontWeight: 600 }}>
                              {Number(p.qty_on_hand).toFixed(0)}
                            </span>
                            {' '}on hand
                            <span className="text-muted-foreground/80"> / min {Number(p.min_on_hand).toFixed(0)}</span>
                          </span>
                          <span>· <span className="font-mono">${Number(p.unit_cost).toFixed(2)}</span> cost</span>
                          <span>· <span className="font-mono">${Number(p.unit_price).toFixed(2)}</span> price</span>
                          {p.vendor && <span>· {p.vendor}</span>}
                          {p.location && <span>· {p.location}</span>}
                        </div>
                      </div>
                      {canMutate && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => quickConsume(p.id)}
                            disabled={busy || Number(p.qty_on_hand) === 0}
                            title="Consume 1"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => quickRestock(p.id)}
                            disabled={busy}
                            title="Restock 1"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setEditingId(p.id)}
                            disabled={busy}
                            title="Edit"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => archive(p.id, p.part_number)}
                            disabled={busy}
                            title="Archive"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tint}`}>
      <div className="text-[10px] uppercase tracking-wider" style={{ fontWeight: 700 }}>{label}</div>
      <div className="text-[20px] mt-0.5" style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
}
