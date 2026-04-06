'use client'

import { X, AlertTriangle } from 'lucide-react'
import { PartOfferSortBar } from './PartOfferSortBar'
import { PartOfferList } from './PartOfferList'
import { track } from '@/lib/analytics/posthog'
import type { NormalizedPartOffer, PartSearchResponse, PartSortMode } from '@/lib/parts/types'

interface Props {
  result: PartSearchResponse
  onClose: () => void
  onSort: (mode: PartSortMode) => void
  sortMode: PartSortMode
  isResorting?: boolean
  canOrder: boolean
  aircraftId?: string | null
  workOrderId?: string | null
  onOrderCreated?: (orderRecordId: string) => void
}

export function AtlasResultsDrawer({
  result,
  onClose,
  onSort,
  sortMode,
  isResorting,
  canOrder,
  aircraftId,
  workOrderId,
  onOrderCreated,
}: Props) {
  const partialFailure = result.summary.providersFailed.length > 0

  async function handleOrder(offer: NormalizedPartOffer, quantity: number) {
    track.partOfferClick({
      organization_id: undefined,
      aircraft_id: aircraftId ?? undefined,
      work_order_id: workOrderId ?? undefined,
      provider: offer.provider,
      result_count: result.summary.count,
    })

    const res = await fetch('/api/parts/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search_id: result.searchId,
        offer_id: offer.id,
        aircraft_id: aircraftId ?? null,
        work_order_id: workOrderId ?? null,
        quantity,
      }),
    })

    if (!res.ok) {
      console.error('[AtlasResultsDrawer] click record failed', await res.text())
      // Still open the vendor URL even if recording fails
      window.open(offer.productUrl, '_blank', 'noopener,noreferrer')
      return
    }

    const data = await res.json() as { order_record_id: string; redirect_url: string }
    window.open(data.redirect_url, '_blank', 'noopener,noreferrer')
    onOrderCreated?.(data.order_record_id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-foreground text-sm">
            Atlas Parts Results
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          &quot;{result.query}&quot;
        </p>

        {/* Summary hero */}
        <div className="flex gap-3 mt-3">
          {result.summary.bestPrice != null && (
            <div className="flex-1 bg-brand-50 rounded-md p-2 text-center">
              <p className="text-xs text-muted-foreground">Best Price</p>
              <p className="text-base font-bold text-brand-700">
                ${result.summary.bestPrice.toFixed(2)}
              </p>
            </div>
          )}
          {result.summary.fastestDeliveryLabel && (
            <div className="flex-1 bg-green-50 rounded-md p-2 text-center">
              <p className="text-xs text-muted-foreground">Fastest</p>
              <p className="text-xs font-semibold text-green-700 leading-tight">
                {result.summary.fastestDeliveryLabel}
              </p>
            </div>
          )}
          <div className="flex-1 bg-muted rounded-md p-2 text-center">
            <p className="text-xs text-muted-foreground">Results</p>
            <p className="text-base font-bold text-foreground">{result.summary.count}</p>
          </div>
        </div>

        {partialFailure && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            Some sources were temporarily unavailable.
          </div>
        )}
      </div>

      {/* Sort bar */}
      <div className="px-4 py-2 border-b border-border">
        <PartOfferSortBar
          value={sortMode}
          onChange={onSort}
          resultCount={result.offers.length}
        />
      </div>

      {/* Offer list */}
      <div className="flex-1 overflow-y-auto p-4">
        <PartOfferList
          offers={result.offers}
          onOrder={handleOrder}
          canOrder={canOrder}
          isLoading={isResorting}
        />
      </div>

      {/* Trust footer */}
      <div className="p-3 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground text-center">
          Results aggregated from multiple sources. Verify fitment and certifications before ordering.
        </p>
      </div>
    </div>
  )
}
