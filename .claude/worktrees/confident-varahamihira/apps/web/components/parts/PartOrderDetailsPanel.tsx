'use client'

import { useState } from 'react'
import { X, Package, ExternalLink, Clipboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PartOrderStatusBadge } from './PartOrderStatusBadge'
import { MarkOrderedDialog } from './MarkOrderedDialog'
import { AttachToWorkOrderDialog } from './AttachToWorkOrderDialog'
import { cn } from '@/lib/utils'
import type { AtlasOrderRecord, PartOrderStatus } from '@/lib/parts/types'

const STATUS_PROGRESSION: PartOrderStatus[] = [
  'clicked_out', 'marked_ordered', 'shipped', 'received', 'installed',
]

interface Props {
  order: AtlasOrderRecord
  onClose: () => void
  onStatusUpdate: (status: PartOrderStatus) => Promise<void>
  onMarkOrdered: (data: { vendor_order_reference: string; internal_note: string }) => Promise<void>
  onAttachToWorkOrder: (workOrderId: string, unitCost?: number) => Promise<void>
  canWrite: boolean
}

export function PartOrderDetailsPanel({
  order,
  onClose,
  onStatusUpdate,
  onMarkOrdered,
  onAttachToWorkOrder,
  canWrite,
}: Props) {
  const [showMarkOrdered, setShowMarkOrdered] = useState(false)
  const [showAttach, setShowAttach] = useState(false)

  const currentStepIdx = STATUS_PROGRESSION.indexOf(order.status as PartOrderStatus)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground text-sm">Order Details</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Part info */}
        <div className="flex gap-3">
          <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            {order.selected_image_url ? (
              <img
                src={order.selected_image_url}
                alt={order.selected_title ?? ''}
                className="w-full h-full object-contain rounded-md"
              />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug">
              {order.selected_title ?? 'Unknown Part'}
            </p>
            {order.selected_part_number && (
              <p className="font-mono text-xs text-muted-foreground mt-0.5">
                {order.selected_part_number}
              </p>
            )}
            <div className="mt-1">
              <PartOrderStatusBadge status={order.status} />
            </div>
          </div>
        </div>

        {/* Progress track */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Progress</p>
          <div className="flex items-center gap-1">
            {STATUS_PROGRESSION.map((step, idx) => (
              <div key={step} className="flex items-center gap-1 flex-1">
                <div className={cn(
                  'h-1.5 rounded-full flex-1 transition-colors',
                  idx <= currentStepIdx ? 'bg-brand-500' : 'bg-muted'
                )} />
                {idx < STATUS_PROGRESSION.length - 1 && (
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    idx < currentStepIdx ? 'bg-brand-500' : 'bg-muted'
                  )} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {STATUS_PROGRESSION.map(step => (
              <span key={step} className="text-[10px] text-muted-foreground capitalize">
                {step.replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {order.vendor_name && (
              <>
                <dt className="text-muted-foreground">Vendor</dt>
                <dd className="font-medium text-foreground">{order.vendor_name}</dd>
              </>
            )}
            {order.quantity && (
              <>
                <dt className="text-muted-foreground">Qty</dt>
                <dd className="font-medium text-foreground">{order.quantity}</dd>
              </>
            )}
            {order.unit_price != null && (
              <>
                <dt className="text-muted-foreground">Unit Price</dt>
                <dd className="font-medium text-foreground">${order.unit_price.toFixed(2)}</dd>
              </>
            )}
            {order.total_price != null && (
              <>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-medium text-foreground">${order.total_price.toFixed(2)}</dd>
              </>
            )}
            {order.selected_condition && (
              <>
                <dt className="text-muted-foreground">Condition</dt>
                <dd className="font-medium text-foreground capitalize">{order.selected_condition}</dd>
              </>
            )}
            {order.vendor_order_reference && (
              <>
                <dt className="text-muted-foreground">Order #</dt>
                <dd className="font-medium text-foreground font-mono text-xs">{order.vendor_order_reference}</dd>
              </>
            )}
          </dl>
        </div>

        {order.internal_note && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Note</p>
            <p className="text-sm text-foreground bg-muted rounded-md p-2">{order.internal_note}</p>
          </div>
        )}

        {/* Vendor link */}
        {order.vendor_url && (
          <a
            href={order.vendor_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs text-brand-600 hover:text-brand-700"
          >
            <ExternalLink className="h-3 w-3" />
            Open vendor page
          </a>
        )}

        {/* Actions */}
        {canWrite && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</p>

            {order.status === 'clicked_out' && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowMarkOrdered(true)}
              >
                <Clipboard className="h-3.5 w-3.5" />
                Mark as Ordered
              </Button>
            )}

            {!order.work_order_id && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setShowAttach(true)}
              >
                Attach to Work Order
              </Button>
            )}

            {order.status === 'marked_ordered' && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onStatusUpdate('shipped')}
              >
                Mark Shipped
              </Button>
            )}

            {order.status === 'shipped' && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onStatusUpdate('received')}
              >
                Mark Received
              </Button>
            )}

            {order.status === 'received' && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onStatusUpdate('installed')}
              >
                Mark Installed
              </Button>
            )}

            {order.status !== 'cancelled' && order.status !== 'installed' && (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => onStatusUpdate('cancelled')}
              >
                Cancel Order
              </Button>
            )}
          </div>
        )}
      </div>

      {showMarkOrdered && (
        <MarkOrderedDialog
          order={order}
          open={showMarkOrdered}
          onClose={() => setShowMarkOrdered(false)}
          onConfirm={onMarkOrdered}
        />
      )}

      {showAttach && (
        <AttachToWorkOrderDialog
          order={order}
          open={showAttach}
          onClose={() => setShowAttach(false)}
          onConfirm={onAttachToWorkOrder}
        />
      )}
    </div>
  )
}
