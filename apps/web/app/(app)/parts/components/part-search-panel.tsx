'use client'

import { useState } from 'react'
import { Search, Loader2, ExternalLink, ShieldCheck, Globe, AlertTriangle, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RankedOffer, SearchResponse } from '@/lib/parts/types'

interface Aircraft { id: string; tail_number: string; make?: string | null; model?: string | null; year?: number | null }

interface Props {
  aircraft: Aircraft[]
  onOrderCreated?: (order: unknown) => void
}

export function PartSearchPanel({ aircraft, onOrderCreated }: Props) {
  const [query, setQuery] = useState('')
  const [aircraftId, setAircraftId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clickedBusyId, setClickedBusyId] = useState<string | null>(null)

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setBusy(true); setError(null); setResponse(null)
    try {
      const resp = await fetch('/api/parts/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          aircraft_id: aircraftId || null,
        }),
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Search failed')
      setResponse(j)
    } catch (err: any) {
      setError(err?.message ?? 'Search failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleClickOut(offer: RankedOffer) {
    if (!offer.id) { window.open(offer.productUrl, '_blank'); return }
    setClickedBusyId(offer.id)
    try {
      const resp = await fetch('/api/parts/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_offer_id: offer.id,
          part_search_id: response?.searchId,
          aircraft_id: aircraftId || null,
          quantity: 1,
        }),
      })
      const j = await resp.json()
      if (resp.ok && j.productUrl) {
        window.open(j.productUrl, '_blank', 'noopener,noreferrer')
        if (onOrderCreated) {
          const order = {
            id: j.orderId,
            status: 'clicked_out',
            quantity: 1,
            unit_price: offer.price ?? null,
            total_price: offer.totalEstimatedPrice ?? offer.price ?? null,
            currency: offer.currency ?? 'USD',
            vendor_name: offer.vendorName ?? null,
            vendor_url: offer.productUrl,
            selected_part_number: offer.partNumber ?? null,
            selected_title: offer.title,
            selected_condition: offer.condition ?? null,
            selected_image_url: offer.imageUrl ?? null,
            aircraft_id: aircraftId || null,
            work_order_id: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          onOrderCreated(order)
        }
      } else {
        setError(j.error ?? 'Could not record click-out')
      }
    } catch (err: any) {
      setError(err?.message ?? 'Click-out failed')
    } finally {
      setClickedBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={runSearch} className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by part number or description (e.g. CH48110-1, Lycoming O-360 oil filter)"
            className="pl-9"
          />
        </div>
        <select
          value={aircraftId}
          onChange={e => setAircraftId(e.target.value)}
          className="h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">No aircraft context</option>
          {aircraft.map(ac => (
            <option key={ac.id} value={ac.id}>
              {ac.tail_number} {ac.make && ac.model ? `· ${ac.make} ${ac.model}` : ''}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={busy || !query.trim()}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Searching…</> : <>Search</>}
        </Button>
      </form>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {response && (
        <>
          {/* Provider summary */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(response.providerSummary).map(([p, info]) => (
              <span
                key={p}
                className={cn(
                  'px-2 py-1 rounded border',
                  info.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
                )}
              >
                {p}: {info.ok ? `${info.count} results` : (info.error ?? 'unavailable')} · {info.durationMs}ms
              </span>
            ))}
            <span className="px-2 py-1 rounded border border-border bg-muted/40">
              mode: {response.searchMode} · {response.resultCount} offers
            </span>
          </div>

          {/* Results list */}
          {response.offers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No results</p>
              <p className="text-xs text-muted-foreground mt-1">Try a part number or a more specific description.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {response.offers.map((offer, idx) => (
                <OfferCard
                  key={(offer.id ?? idx) + offer.productUrl}
                  offer={offer}
                  onClick={() => handleClickOut(offer)}
                  loading={!!offer.id && clickedBusyId === offer.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function OfferCard({ offer, onClick, loading }: { offer: RankedOffer; onClick: () => void; loading: boolean }) {
  const bucketBadge =
    offer.sortBucket === 'aviation_trusted'
      ? { text: 'Aviation vendor', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: ShieldCheck }
      : offer.sortBucket === 'general_marketplace'
      ? { text: 'Marketplace', bg: 'bg-slate-50 text-slate-700 border-slate-200', Icon: Globe }
      : { text: 'Unverified', bg: 'bg-amber-50 text-amber-700 border-amber-200', Icon: AlertTriangle }
  const B = bucketBadge.Icon
  const priceText = offer.price != null ? `$${offer.price.toFixed(2)} ${offer.currency ?? ''}` : 'No price listed'

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex gap-3">
      <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
        {offer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 flex-1">{offer.title}</h3>
          <span className={cn('text-[10px] font-medium uppercase tracking-wide border rounded px-1.5 py-0.5 flex items-center gap-1 flex-shrink-0', bucketBadge.bg)}>
            <B className="h-3 w-3" />
            {bucketBadge.text}
          </span>
        </div>
        {offer.partNumber && (
          <p className="text-xs font-mono text-muted-foreground mt-0.5">P/N {offer.partNumber}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-xs">
          <span className="font-semibold text-foreground tabular-nums">{priceText}</span>
          {offer.condition && offer.condition !== 'unknown' && (
            <span className="text-muted-foreground capitalize">{offer.condition}</span>
          )}
          <span className="text-muted-foreground truncate">{offer.vendorName}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" onClick={onClick} disabled={loading} className="h-7 text-xs">
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            Open at vendor
          </Button>
          {offer.shippingSpeedLabel && (
            <span className="text-[10px] text-muted-foreground">{offer.shippingSpeedLabel}</span>
          )}
        </div>
      </div>
    </div>
  )
}
