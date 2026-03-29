import { cn } from '@/lib/utils'
import type { QueryConfidence } from '@/types'

const CONFIG: Record<QueryConfidence, { label: string; className: string }> = {
  high: { label: 'High confidence', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  medium: { label: 'Medium confidence', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  low: { label: 'Low confidence', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  insufficient_evidence: { label: 'Insufficient evidence', className: 'bg-red-100 text-red-800 border-red-200' },
}

export function ConfidenceBadge({ confidence }: { confidence: QueryConfidence }) {
  const { label, className } = CONFIG[confidence]
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border', className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', {
        'bg-emerald-500': confidence === 'high',
        'bg-amber-500': confidence === 'medium',
        'bg-orange-500': confidence === 'low',
        'bg-red-500': confidence === 'insufficient_evidence',
      })} />
      {label}
    </span>
  )
}
