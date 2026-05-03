'use client'

/**
 * CostsView (Spec 7.1) — list / filter / inline-create cost entries.
 *
 * Tabs: All · By aircraft · By category · Pending review
 * "+ New cost" opens CostEntryForm modal.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, DollarSign, Search, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CostEntryForm } from './cost-entry-form'
import { CATEGORY_LABEL, BUCKET_LABEL, type CostCategory, type CostBucket } from '@/lib/costs/categories'
import type { CostEntry } from '@/types'

type Tab = 'all' | 'pending' | 'fuel-oil' | 'fixed' | 'maintenance'

const TAB_FILTERS: Record<Tab, { categories?: CostCategory[]; buckets?: CostBucket[]; approved?: boolean }> = {
  all:         {},
  pending:     { approved: false },
  'fuel-oil':  { categories: ['fuel', 'oil'] },
  fixed:       { buckets: ['annual_fixed', 'monthly_fixed', 'loan'] },
  maintenance: { categories: ['parts', 'labor', 'outside_service', 'annual_inspection', '100_hour'] },
}

export function CostsView() {
  const [tab, setTab] = useState<Tab>('all')
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '200' })
      const f = TAB_FILTERS[tab]
      if (f.approved === false) params.set('approved', '0')
      const res = await fetch(`/api/costs?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setEntries((data.entries ?? []) as CostEntry[])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { void reload() }, [reload])

  const filtered = useMemo(() => {
    const f = TAB_FILTERS[tab]
    let rows = entries
    if (f.categories) rows = rows.filter((r) => f.categories!.includes(r.category as CostCategory))
    if (f.buckets) rows = rows.filter((r) => f.buckets!.includes(r.bucket as CostBucket))
    const q = searchQ.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) =>
        (r.description ?? '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      )
    }
    return rows
  }, [entries, tab, searchQ])

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [filtered],
  )

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'all',         label: 'All' },
    { id: 'pending',     label: 'Pending review' },
    { id: 'fuel-oil',    label: 'Fuel & Oil' },
    { id: 'fixed',       label: 'Fixed costs' },
    { id: 'maintenance', label: 'Maintenance' },
  ]

  async function handleApprove(id: string) {
    const res = await fetch(`/api/costs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    })
    if (!res.ok) { toast.error('Approve failed'); return }
    toast.success('Approved')
    await reload()
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Costs
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Operating costs ledger. Forward bills via email or upload receipts — AI extracts the rest (sprint 7.2 / 7.3).
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New cost
        </Button>
      </div>

      <div className="px-6 pt-3 pb-3 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-1.5 max-w-md flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Description, category, notes…"
            className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="text-[12px] text-foreground inline-flex items-center gap-2 bg-muted/40 border border-border rounded-full px-3 py-1.5">
          Total <span className="font-mono" style={{ fontWeight: 700 }}>${totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <DollarSign className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No costs in this view</p>
            <p className="text-xs text-muted-foreground mt-1">Click "New cost" to add a manual entry.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border overflow-hidden max-w-6xl mx-auto m-6">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Date', 'Category', 'Description', 'Amount', 'Bucket', 'Source'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                      {h}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const cat = (CATEGORY_LABEL[r.category as CostCategory]) ?? r.category
                  const bucket = BUCKET_LABEL[r.bucket as CostBucket] ?? r.bucket
                  return (
                    <tr key={r.id} className={cn('hover:bg-muted/20', !r.approved && 'bg-amber-50/40')}>
                      <td className="px-3 py-2 tabular-nums">{r.cost_date}</td>
                      <td className="px-3 py-2">{cat}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.description ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums font-mono">${Number(r.amount).toFixed(2)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{bucket}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">
                        {r.source}{r.is_estimate && <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700">est</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!r.approved && (
                          <button onClick={() => handleApprove(r.id)} className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:underline" style={{ fontWeight: 600 }}>
                            <AlertTriangle className="h-3 w-3" /> Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <CostEntryForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void reload() }}
        />
      )}
    </div>
  )
}
