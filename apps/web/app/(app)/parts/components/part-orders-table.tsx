'use client'

import { useState } from 'react'
import { ExternalLink, Plane, Package } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

type OrderStatus =
  | 'draft' | 'clicked_out' | 'marked_ordered' | 'confirmed'
  | 'shipped' | 'delivered' | 'received' | 'installed' | 'cancelled'

interface Order {
  id: string
  status: string
  quantity: number
  unit_price: number | null
  total_price: number | null
  currency: string | null
  vendor_name: string | null
  vendor_url: string | null
  selected_part_number: string | null
  selected_title: string | null
  selected_condition: string | null
  selected_image_url: string | null
  aircraft_id: string | null
  work_order_id: string | null
  created_at: string
  updated_at: string
  aircraft?: { id: string; tail_number: string } | null
}

interface Aircraft { id: string; tail_number: string }

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  clicked_out: 'Clicked out',
  marked_ordered: 'Ordered',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  received: 'Received',
  installed: 'Installed',
  cancelled: 'Cancelled',
}
const STATUS_COLOR: Record<OrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  clicked_out: 'bg-blue-50 text-blue-700 border-blue-200',
  marked_ordered: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  confirmed: 'bg-violet-50 text-violet-700 border-violet-200',
  shipped: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  received: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  installed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}

interface Props {
  orders: Order[]
  aircraft: Aircraft[]
  initialAircraftId?: string
  initialStatus?: string
  onUpdate?: (next: Order[]) => void
}

export function PartOrdersTable({ orders, aircraft, initialAircraftId, initialStatus, onUpdate }: Props) {
  const [aircraftFilter, setAircraftFilter] = useState(initialAircraftId ?? '')
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? '')
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = orders.filter(o => {
    if (aircraftFilter && o.aircraft_id !== aircraftFilter) return false
    if (statusFilter && o.status !== statusFilter) return false
    return true
  })

  async function updateStatus(id: string, status: OrderStatus) {
    setBusy(id)
    try {
      const resp = await fetch(`/api/parts/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (resp.ok) {
        const next = orders.map(o => o.id === id ? { ...o, status, updated_at: new Date().toISOString() } : o)
        if (onUpdate) onUpdate(next)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={aircraftFilter}
          onChange={e => setAircraftFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All aircraft</option>
          {aircraft.map(ac => (
            <option key={ac.id} value={ac.id}>{ac.tail_number}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="">All statuses</option>
          {(Object.entries(STATUS_LABEL) as [OrderStatus, string][]).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No part orders yet</p>
          <p className="text-xs text-muted-foreground mt-1">Use Search Parts to find a part and open it at a vendor.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Part</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-2">
                        {o.selected_image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.selected_image_url} alt="" className="w-8 h-8 rounded border border-border object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{o.selected_title ?? 'Part'}</p>
                          {o.selected_part_number && (
                            <p className="text-[10px] font-mono text-muted-foreground">P/N {o.selected_part_number}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {o.vendor_url ? (
                        <a href={o.vendor_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                          {o.vendor_name ?? 'Vendor'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{o.vendor_name ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.aircraft ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono">
                          <Plane className="h-3 w-3 text-muted-foreground" />
                          {o.aircraft.tail_number}
                        </span>
                      ) : (<span className="text-xs text-muted-foreground">—</span>)}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={o.status}
                        disabled={busy === o.id}
                        onChange={e => updateStatus(o.id, e.target.value as OrderStatus)}
                        className={cn(
                          'text-[10px] font-medium uppercase tracking-wide border rounded px-1.5 py-1',
                          STATUS_COLOR[(o.status as OrderStatus)] ?? STATUS_COLOR.draft
                        )}
                      >
                        {(Object.entries(STATUS_LABEL) as [OrderStatus, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">
                      {o.total_price != null ? `$${Number(o.total_price).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
