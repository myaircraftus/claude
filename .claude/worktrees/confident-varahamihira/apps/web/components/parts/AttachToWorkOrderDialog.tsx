'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { AtlasOrderRecord } from '@/lib/parts/types'

interface WorkOrder {
  id: string
  work_order_number: string
  status: string
}

interface Props {
  order: AtlasOrderRecord
  open: boolean
  onClose: () => void
  onConfirm: (workOrderId: string, unitCost?: number) => Promise<void>
}

export function AttachToWorkOrderDialog({ order, open, onClose, onConfirm }: Props) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [selectedWoId, setSelectedWoId] = useState('')
  const [unitCost, setUnitCost] = useState(
    order.unit_price != null ? String(order.unit_price) : ''
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    fetch('/api/work-orders?limit=20')
      .then(r => r.json())
      .then((data: WorkOrder[]) => setWorkOrders(data ?? []))
      .catch(() => setWorkOrders([]))
      .finally(() => setIsLoading(false))
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedWoId) return
    setIsSubmitting(true)
    try {
      const cost = unitCost ? parseFloat(unitCost) : undefined
      await onConfirm(selectedWoId, cost)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach to Work Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link <span className="font-medium text-foreground">{order.selected_title}</span> to a work order.
            A part line item will be added automatically.
          </p>

          <div className="space-y-1">
            <Label>Work Order</Label>
            <Select value={selectedWoId} onValueChange={setSelectedWoId}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? 'Loading…' : 'Select work order'} />
              </SelectTrigger>
              <SelectContent>
                {workOrders.map(wo => (
                  <SelectItem key={wo.id} value={wo.id}>
                    {wo.work_order_number} — {wo.status}
                  </SelectItem>
                ))}
                {workOrders.length === 0 && !isLoading && (
                  <SelectItem value="" disabled>No open work orders</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="unitCost">Unit Cost (optional)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                id="unitCost"
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !selectedWoId}>
              {isSubmitting ? 'Attaching…' : 'Attach Part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
