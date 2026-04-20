'use client'

import { useMemo, useState } from 'react'
import { Package, DollarSign, CheckCircle2, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PartSearchPanel } from './part-search-panel'
import { PartOrdersTable } from './part-orders-table'

interface Aircraft { id: string; tail_number: string; make?: string | null; model?: string | null; year?: number | null }
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

interface Props {
  orgId: string
  aircraft: Aircraft[]
  orders: Order[]
  stats: { total: number; ordered: number; received: number; spend: number }
  initialTab: 'search' | 'orders'
  initialAircraftId?: string
  initialStatus?: string
}

export function PartsWorkspace({ aircraft, orders, stats, initialTab, initialAircraftId, initialStatus }: Props) {
  const [tab, setTab] = useState<'search' | 'orders'>(initialTab)
  const [localOrders, setLocalOrders] = useState(orders)

  const statCards = useMemo(() => [
    { label: 'Total Orders', value: stats.total, icon: Package, color: 'text-foreground', bg: 'bg-muted' },
    { label: 'Ordered / Shipping', value: stats.ordered, icon: Truck, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Received', value: stats.received, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Est. Spend', value: `$${stats.spend.toFixed(0)}`, icon: DollarSign, color: 'text-brand-600', bg: 'bg-brand-50' },
  ], [stats])

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parts</h1>
          <p className="text-muted-foreground text-sm">Search vendors live and track every part order.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', stat.bg)}>
                <Icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1" aria-label="Tabs">
          {[
            { k: 'search', label: 'Search Parts' },
            { k: 'orders', label: `My Orders (${localOrders.length})` },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as 'search' | 'orders')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.k
                  ? 'border-brand-500 text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'search' ? (
        <PartSearchPanel
          aircraft={aircraft}
          initialAircraftId={initialAircraftId}
          onOrderCreated={(order) => setLocalOrders(prev => [order as any, ...prev])}
        />
      ) : (
        <PartOrdersTable
          orders={localOrders}
          aircraft={aircraft}
          initialAircraftId={initialAircraftId}
          initialStatus={initialStatus}
          onUpdate={(next) => setLocalOrders(next)}
        />
      )}
    </div>
  )
}
