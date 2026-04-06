'use client'

import { Package, ChevronRight } from 'lucide-react'
import { PartOrderStatusBadge } from './PartOrderStatusBadge'
import { cn } from '@/lib/utils'
import type { AtlasOrderRecord } from '@/lib/parts/types'

interface Props {
  orders: AtlasOrderRecord[]
  onSelectOrder: (order: AtlasOrderRecord) => void
  selectedOrderId?: string
  isLoading?: boolean
}

export function PartOrdersTable({ orders, onSelectOrder, selectedOrderId, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg border border-border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No parts orders yet</p>
        <p className="text-xs text-muted-foreground">
          Search for a part and click Order to start tracking.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map(order => (
        <button
          key={order.id}
          type="button"
          onClick={() => onSelectOrder(order)}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
            selectedOrderId === order.id
              ? 'border-brand-300 bg-brand-50'
              : 'border-border bg-card hover:border-brand-200 hover:bg-accent'
          )}
        >
          {/* Part image or placeholder */}
          <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {order.selected_image_url ? (
              <img
                src={order.selected_image_url}
                alt={order.selected_title ?? ''}
                className="w-full h-full object-contain"
              />
            ) : (
              <Package className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {order.selected_title ?? 'Unknown Part'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {order.selected_part_number && (
                <span className="font-mono text-xs text-muted-foreground">{order.selected_part_number}</span>
              )}
              {order.vendor_name && (
                <span className="text-xs text-muted-foreground truncate">{order.vendor_name}</span>
              )}
              {order.total_price != null && (
                <span className="text-xs font-medium text-foreground">${order.total_price.toFixed(2)}</span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <PartOrderStatusBadge status={order.status} />
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  )
}
