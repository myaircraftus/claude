'use client'

import { cn } from '@/lib/utils'

const COMMON_SEARCHES = [
  'spark plug',
  'oil filter',
  'alternator belt',
  'brake disc',
  'magneto',
  'ELT battery',
  'pitot tube',
  'landing light',
  'fuel cap',
  'static wick',
]

interface Props {
  onSelect: (query: string) => void
  className?: string
}

export function PartCommonSearchChips({ onSelect, className }: Props) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {COMMON_SEARCHES.map(term => (
        <button
          key={term}
          type="button"
          onClick={() => onSelect(term)}
          className="px-3 py-1 rounded-full border border-border bg-card text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {term}
        </button>
      ))}
    </div>
  )
}
