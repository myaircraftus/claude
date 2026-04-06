'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PartSearchInput } from './PartSearchInput'
import { PartCommonSearchChips } from './PartCommonSearchChips'
import { AtlasResultsDrawer } from './AtlasResultsDrawer'
import { PartOfferSortBar } from './PartOfferSortBar'
import { track } from '@/lib/analytics/posthog'
import { rankOffers } from '@/lib/parts/ranking'
import type { PartSearchResponse, PartSortMode } from '@/lib/parts/types'

interface Props {
  open: boolean
  onClose: () => void
  canOrder?: boolean
  aircraftId?: string | null
  aircraftLabel?: string | null
  workOrderId?: string | null
  onOrderCreated?: (orderRecordId: string) => void
}

export function AtlasSearchModal({
  open,
  onClose,
  canOrder = true,
  aircraftId,
  aircraftLabel,
  workOrderId,
  onOrderCreated,
}: Props) {
  const [isSearching, setIsSearching] = useState(false)
  const [result, setResult] = useState<PartSearchResponse | null>(null)
  const [sortMode, setSortMode] = useState<PartSortMode>('best_match')
  const [searchError, setSearchError] = useState<string | null>(null)

  async function handleSearch(query: string) {
    setIsSearching(true)
    setSearchError(null)
    setResult(null)

    track.partSearchRun({
      aircraft_id: aircraftId ?? undefined,
      work_order_id: workOrderId ?? undefined,
      query_type: 'manual',
    })

    try {
      const res = await fetch('/api/parts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          aircraft_id: aircraftId ?? null,
          work_order_id: workOrderId ?? null,
          sort: sortMode,
        }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Search failed')
      }

      const data = await res.json() as PartSearchResponse
      setResult(data)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  function handleSort(mode: PartSortMode) {
    setSortMode(mode)
    if (result) {
      // Client-side re-sort from existing offers
      const reranked = rankOffers(result.offers, result.query, mode)
      setResult({ ...result, offers: reranked })
    }
  }

  function handleClose() {
    setResult(null)
    setSearchError(null)
    setSortMode('best_match')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0">
        {/* Left panel: search */}
        <div className={result ? 'w-full flex h-full' : 'flex flex-col h-full'}>
          {/* Search panel */}
          <div className={result ? 'w-[380px] flex-shrink-0 flex flex-col border-r border-border' : 'flex flex-col h-full'}>
            <DialogHeader className="p-5 pb-4 border-b border-border">
              <DialogTitle className="text-base flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden>
                  <path d="M28 16L4 8L10 16L4 24L28 16Z" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                Atlas Parts Network
              </DialogTitle>
              {aircraftLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Context: {aircraftLabel}
                </p>
              )}
            </DialogHeader>

            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              <PartSearchInput
                onSearch={handleSearch}
                isLoading={isSearching}
              />

              {searchError && (
                <p className="text-sm text-destructive">{searchError}</p>
              )}

              {!result && !isSearching && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium">Common searches</p>
                  <PartCommonSearchChips onSelect={handleSearch} />

                  {/* Info block */}
                  <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 mt-4">
                    <p className="text-xs font-medium text-brand-700 mb-1">How it works</p>
                    <ul className="text-xs text-brand-600 space-y-1 list-disc list-inside">
                      <li>Search by part number, description, or keyword</li>
                      <li>Results from multiple aviation parts sources</li>
                      <li>Click Order to open the vendor — no checkout here</li>
                      <li>Searches are saved to your parts history</li>
                    </ul>
                  </div>
                </div>
              )}

              {isSearching && (
                <div className="space-y-2 pt-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-6 bg-muted rounded animate-pulse" style={{ width: `${70 + i * 10}%` }} />
                  ))}
                  <p className="text-xs text-muted-foreground mt-3">Searching aviation parts sources…</p>
                </div>
              )}
            </div>
          </div>

          {/* Results panel */}
          {result && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <AtlasResultsDrawer
                result={result}
                onClose={() => setResult(null)}
                onSort={handleSort}
                sortMode={sortMode}
                canOrder={canOrder}
                aircraftId={aircraftId}
                workOrderId={workOrderId}
                onOrderCreated={onOrderCreated}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
