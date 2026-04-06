'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { AtlasOrderRecord } from '@/lib/parts/types'

interface Props {
  order: AtlasOrderRecord
  open: boolean
  onClose: () => void
  onConfirm: (data: { vendor_order_reference: string; internal_note: string }) => Promise<void>
}

export function MarkOrderedDialog({ order, open, onClose, onConfirm }: Props) {
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onConfirm({ vendor_order_reference: reference, internal_note: note })
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as Ordered</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              <span className="font-medium text-foreground">{order.selected_title}</span>
              {order.vendor_name && <> from {order.vendor_name}</>}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reference">Order / Confirmation #</Label>
            <Input
              id="reference"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="e.g. ORD-123456"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="note">Internal Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Any notes about this order…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Mark as Ordered'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
