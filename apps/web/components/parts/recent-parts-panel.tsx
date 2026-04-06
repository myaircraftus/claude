'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock, Loader2, Package, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LibraryPart {
  id: string
  part_number: string
  title: string
  base_price: number | null
  currency: string | null
  markup_mode: 'percent' | 'custom_rate' | 'none' | null
  markup_percent: number | null
  custom_rate: number | null
  preferred_vendor: string | null
  last_ordered_at: string | null
}

interface Props {
  onSelect?: (part: LibraryPart) => void
}

function computeSell(part: LibraryPart): number | null {
  const base = part.base_price
  if (base == null) return null
  switch (part.markup_mode) {
    case 'percent':
      return Math.round(base * (1 + (part.markup_percent ?? 0) / 100) * 100) / 100
    case 'custom_rate':
      return part.custom_rate != null ? Math.round(part.custom_rate * 100) / 100 : base
    default:
      return base
  }
}

function formatPrice(v: number | null): string {
  if (v == null) return '--'
  return `$${v.toFixed(2)}`
}

export function RecentPartsPanel({ onSelect }: Props) {
  const [parts, setParts] = useState<LibraryPart[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchParts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/parts/library?sort=recent&limit=20')
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Failed to load')
      setParts(j.parts ?? [])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load recent parts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchParts() }, [fetchParts])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading recent parts...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {error}
      </div>
    )
  }

  if (parts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2">
          <Package className="h-5 w-5 text-muted-foreground/40" />
        </div>
        <p className="text-xs text-muted-foreground">No recent parts yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Recent Parts
      </div>
      {parts.map(part => {
        const sell = computeSell(part)
        return (
          <div
            key={part.id}
            className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono font-semibold text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">
                  {part.part_number}
                </span>
                <span className="text-xs text-foreground truncate font-medium">
                  {part.title}
                </span>
              </div>
              {sell != null && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {formatPrice(sell)}
                </span>
              )}
            </div>
            {onSelect && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={() => onSelect(part)}
                title="Add to work order"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
