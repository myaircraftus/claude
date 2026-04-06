import { cn } from '@/lib/utils'
import type { PartOrderStatus } from '@/lib/parts/types'

const STATUS_CONFIG: Record<PartOrderStatus, { label: string; className: string }> = {
  draft:          { label: 'Draft',          className: 'bg-muted text-muted-foreground' },
  clicked_out:    { label: 'Vendor Opened',  className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  marked_ordered: { label: 'Ordered',        className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  confirmed:      { label: 'Confirmed',      className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  shipped:        { label: 'Shipped',        className: 'bg-purple-50 text-purple-700 border border-purple-200' },
  delivered:      { label: 'Delivered',      className: 'bg-teal-50 text-teal-700 border border-teal-200' },
  received:       { label: 'Received',       className: 'bg-green-50 text-green-700 border border-green-200' },
  installed:      { label: 'Installed',      className: 'bg-green-100 text-green-800 border border-green-300' },
  cancelled:      { label: 'Cancelled',      className: 'bg-red-50 text-red-600 border border-red-200' },
}

interface Props {
  status: PartOrderStatus
  className?: string
}

export function PartOrderStatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      config.className,
      className
    )}>
      {config.label}
    </span>
  )
}
