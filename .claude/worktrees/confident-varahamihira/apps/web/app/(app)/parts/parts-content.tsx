'use client'

import { useState, useEffect, useCallback } from 'react'
import { AtlasSearchModal } from '@/components/parts/AtlasSearchModal'
import { PartOrdersTable } from '@/components/parts/PartOrdersTable'
import { PartOrderDetailsPanel } from '@/components/parts/PartOrderDetailsPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Package, ShoppingCart, Truck, CheckCircle, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'
import { track } from '@/lib/analytics/posthog'
import type { AtlasOrderRecord, PartOrderStatus } from '@/lib/parts/types'

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Ordered', value: 'marked_ordered' },
  { label: 'In Transit', value: 'shipped' },
  { label: 'Received', value: 'received' },
  { label: 'Installed', value: 'installed' },
  { label: 'Cancelled', value: 'cancelled' },
]

const ACTIVE_STATUSES: PartOrderStatus[] = ['clicked_out', 'marked_ordered', 'confirmed', 'shipped', 'delivered']

interface Props {
  canWrite: boolean
}

export function PartsContent({ canWrite }: Props) {
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [orders, setOrders] = useState<AtlasOrderRecord[]>([])
  const [filteredOrders, setFilteredOrders] = useState<AtlasOrderRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<AtlasOrderRecord | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [filterText, setFilterText] = useState('')

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/parts/orders?limit=100')
      if (res.ok) {
        const data = await res.json() as AtlasOrderRecord[]
        setOrders(data)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Apply tab + text filter
  useEffect(() => {
    let result = orders
    if (activeTab === 'active') {
      result = orders.filter(o => ACTIVE_STATUSES.includes(o.status))
    } else if (activeTab !== 'all') {
      result = orders.filter(o => o.status === activeTab)
    }
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      result = result.filter(o =>
        o.selected_title?.toLowerCase().includes(q) ||
        o.selected_part_number?.toLowerCase().includes(q) ||
        o.vendor_name?.toLowerCase().includes(q)
      )
    }
    setFilteredOrders(result)
  }, [orders, activeTab, filterText])

  // ─── Stats ────────────────────────────────────────────────────────────────

  const stats = {
    total: orders.length,
    inTransit: orders.filter(o => o.status === 'shipped' || o.status === 'delivered').length,
    received: orders.filter(o => o.status === 'received' || o.status === 'installed').length,
    totalSpend: orders.reduce((sum, o) => sum + (o.total_price ?? 0), 0),
  }

  // ─── Order actions ────────────────────────────────────────────────────────

  async function handleStatusUpdate(status: PartOrderStatus) {
    if (!selectedOrder) return
    const res = await fetch(`/api/parts/orders/${selectedOrder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated = await res.json() as AtlasOrderRecord
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      setSelectedOrder(updated)
      track.partOrderStatusChanged({ status })
    }
  }

  async function handleMarkOrdered(data: { vendor_order_reference: string; internal_note: string }) {
    if (!selectedOrder) return
    const res = await fetch(`/api/parts/orders/${selectedOrder.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'marked_ordered',
        vendor_order_reference: data.vendor_order_reference || null,
        internal_note: data.internal_note || null,
        ordered_at: new Date().toISOString(),
      }),
    })
    if (res.ok) {
      const updated = await res.json() as AtlasOrderRecord
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      setSelectedOrder(updated)
    }
  }

  async function handleAttachToWorkOrder(workOrderId: string, unitCost?: number) {
    if (!selectedOrder) return
    const res = await fetch('/api/parts/attach-to-work-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: selectedOrder.id,
        work_order_id: workOrderId,
        part_number: selectedOrder.selected_part_number,
        title: selectedOrder.selected_title ?? 'Part',
        quantity: selectedOrder.quantity,
        unit_cost: unitCost,
      }),
    })
    if (res.ok) {
      const updated = { ...selectedOrder, work_order_id: workOrderId }
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o))
      setSelectedOrder(updated)
      track.partAttachedToWorkOrder({ work_order_id: workOrderId })
    }
  }

  function handleOrderCreated(orderRecordId: string) {
    setSearchModalOpen(false)
    fetchOrders().then(() => {
      setOrders(prev => {
        const found = prev.find(o => o.id === orderRecordId)
        if (found) setSelectedOrder(found)
        return prev
      })
    })
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Parts Orders</h1>
            <p className="text-sm text-muted-foreground">Track parts sourced via Atlas Parts Network</p>
          </div>
          {canWrite && (
            <Button onClick={() => setSearchModalOpen(true)} className="gap-2">
              <Search className="h-4 w-4" />
              Find a Part
            </Button>
          )}
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Orders', value: stats.total, icon: Package, color: 'text-foreground' },
            { label: 'In Transit', value: stats.inTransit, icon: Truck, color: 'text-purple-600' },
            { label: 'Received', value: stats.received, icon: CheckCircle, color: 'text-green-600' },
            {
              label: 'Total Spend',
              value: `$${stats.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              icon: DollarSign,
              color: 'text-brand-600',
            },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <stat.icon className={cn('h-4 w-4', stat.color)} />
              </div>
              <p className={cn('text-xl font-bold mt-1', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Filter + tabs */}
          <div className="px-6 pt-4 pb-3 border-b border-border space-y-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="Filter by part, vendor…"
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    activeTab === tab.value
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orders list */}
          <div className="flex-1 overflow-y-auto p-6">
            <PartOrdersTable
              orders={filteredOrders}
              onSelectOrder={setSelectedOrder}
              selectedOrderId={selectedOrder?.id}
              isLoading={isLoading}
            />
          </div>

          {/* Atlas CTA banner — shown when empty */}
          {!isLoading && orders.length === 0 && (
            <div className="mx-6 mb-6 rounded-xl bg-slate-900 text-white p-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-lg mb-1">Atlas Parts Network</p>
                <p className="text-sm text-slate-300">
                  Search aviation parts across multiple sources. Compare prices, conditions, and shipping.
                  Click out to order — every selection is tracked here automatically.
                </p>
              </div>
              {canWrite && (
                <Button
                  onClick={() => setSearchModalOpen(true)}
                  className="flex-shrink-0 bg-brand-500 hover:bg-brand-600 text-white gap-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Search Parts
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedOrder && (
          <div className="w-80 flex-shrink-0 border-l border-border overflow-hidden">
            <PartOrderDetailsPanel
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
              onStatusUpdate={handleStatusUpdate}
              onMarkOrdered={handleMarkOrdered}
              onAttachToWorkOrder={handleAttachToWorkOrder}
              canWrite={canWrite}
            />
          </div>
        )}
      </div>

      <AtlasSearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        canOrder={canWrite}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  )
}
