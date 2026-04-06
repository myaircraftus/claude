'use client'

import { cn } from '@/lib/utils'
import type { PartSortMode } from '@/lib/parts/types'

const SORT_OPTIONS: { value: PartSortMode; label: string }[] = [
  { value: 'best_match',       label: 'Best Match' },
  { value: 'best_price',       label: 'Best Price' },
  { value: 'fastest_delivery', label: 'Fastest' },
  { value: 'best_condition',   label: 'Condition' },
  { value: 'top_rated',        label: 'Top Rated' },
]

interface Props {
  value: PartSortMode
  onChange: (mode: PartSortMode) => void
  resultCount?: number
}

export function PartOfferSortBar({ value, onChange, resultCount }: Props) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {resultCount != null ? `${resultCount} result${resultCount !== 1 ? 's' : ''}` : ''}
      </p>
      <div className="flex gap-1">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              value === opt.value
                ? 'bg-brand-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
