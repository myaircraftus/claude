'use client'

import { useState } from 'react'
import { ExternalLink, Star, Package, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { NormalizedPartOffer } from '@/lib/parts/types'

interface Props {
  offer: NormalizedPartOffer
  onOrder: (offer: NormalizedPartOffer, quantity: number) => Promise<void>
  canOrder?: boolean
}

export function PartOfferCard({ offer, onOrder, canOrder = true }: Props) {
  const [qty, setQty] = useState(1)
  const [isOrdering, setIsOrdering] = useState(false)
  const [ordered, setOrdered] = useState(false)

  async function handleOrder() {
    setIsOrdering(true)
    try {
      await onOrder(offer, qty)
      setOrdered(true)
    } finally {
      setIsOrdering(false)
    }
  }

  const conditionColors: Record<string, string> = {
    new:         'bg-green-50 text-green-700 border-green-200',
    overhauled:  'bg-blue-50 text-blue-700 border-blue-200',
    serviceable: 'bg-teal-50 text-teal-700 border-teal-200',
    used:        'bg-amber-50 text-amber-700 border-amber-200',
    unknown:     'bg-muted text-muted-foreground border-border',
  }

  return (
    <div className="flex gap-3 p-4 rounded-lg border border-border bg-card hover:border-brand-200 transition-colors">
      {/* Image */}
      <div className="flex-shrink-0 w-16 h-16 rounded-md bg-muted flex items-center justify-center overflow-hidden">
        {offer.imageUrl ? (
          <img
            src={offer.imageUrl}
            alt={offer.title}
            className="w-full h-full object-contain"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <Package className="h-7 w-7 text-muted-foreground/40" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1">
            {offer.title}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {offer.partNumber && (
            <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {offer.partNumber}
            </span>
          )}
          {offer.condition && offer.condition !== 'unknown' && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded border font-medium',
              conditionColors[offer.condition] ?? conditionColors.unknown
            )}>
              {offer.condition.charAt(0).toUpperCase() + offer.condition.slice(1)}
            </span>
          )}
          {offer.badges?.map(badge => (
            <Badge key={badge} variant="secondary" className="text-xs py-0">
              {badge}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="font-medium text-foreground">{offer.vendorName}</span>
          {offer.vendorDomain && (
            <span className="text-muted-foreground">{offer.vendorDomain}</span>
          )}
          {offer.rating != null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              {offer.rating.toFixed(1)}
              {offer.ratingCount && (
                <span className="text-muted-foreground">({offer.ratingCount})</span>
              )}
            </span>
          )}
        </div>

        {/* Compatibility disclaimer */}
        {offer.compatibilityText?.length ? (
          <p className="text-xs text-muted-foreground italic mb-2 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            Source states: {offer.compatibilityText[0]} — verify fitment before ordering.
          </p>
        ) : null}

        {/* Price + actions */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            {offer.price != null ? (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-foreground">
                  ${offer.price.toFixed(2)}
                </span>
                {offer.shippingPrice != null && (
                  <span className="text-xs text-muted-foreground">
                    + ${offer.shippingPrice.toFixed(2)} shipping
                  </span>
                )}
                {offer.shippingPrice === 0 && (
                  <span className="text-xs text-green-600">Free shipping</span>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">Price unavailable</span>
            )}
            {offer.shippingSpeedLabel && (
              <p className="text-xs text-muted-foreground">{offer.shippingSpeedLabel}</p>
            )}
            {offer.stockLabel && (
              <p className="text-xs text-green-600">{offer.stockLabel}</p>
            )}
          </div>

          {canOrder && (
            <div className="flex items-center gap-2">
              {/* Quantity stepper */}
              <div className="flex items-center border border-border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors text-sm"
                >
                  −
                </button>
                <span className="w-8 text-center text-xs font-medium">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty(q => Math.min(99, q + 1))}
                  className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors text-sm"
                >
                  +
                </button>
              </div>

              {/* Order button */}
              <Button
                size="sm"
                onClick={handleOrder}
                disabled={isOrdering || ordered}
                className={cn(
                  'gap-1.5 text-xs h-8',
                  ordered && 'bg-green-600 hover:bg-green-600'
                )}
              >
                {isOrdering ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                {ordered ? 'Opened!' : 'Order'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
