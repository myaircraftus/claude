'use client'

import { Package } from 'lucide-react'
import { PartOfferCard } from './PartOfferCard'
import type { NormalizedPartOffer } from '@/lib/parts/types'

interface Props {
  offers: NormalizedPartOffer[]
  onOrder: (offer: NormalizedPartOffer, quantity: number) => Promise<void>
  canOrder?: boolean
  isLoading?: boolean
}

export function PartOfferList({ offers, onOrder, canOrder, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 rounded-lg border border-border bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (offers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">No matching parts found</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Try a broader keyword, remove dashes from the part number, search the exact OEM part number,
          or try an alternate description.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {offers.map(offer => (
        <PartOfferCard
          key={offer.id}
          offer={offer}
          onOrder={onOrder}
          canOrder={canOrder}
        />
      ))}
    </div>
  )
}
