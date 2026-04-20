'use client'

import { useEffect, useState } from 'react'
import {
  Search, Loader2, ExternalLink, ShieldCheck, Globe,
  AlertTriangle, ShoppingBag, Sparkles, Cpu, Tag,
  Plane, Users, Wrench, Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RankedOffer, SearchResponse, AIResolutionInfo, LibraryMatch } from '@/lib/parts/types'

interface Aircraft { id: string; tail_number: string; make?: string | null; model?: string | null; year?: number | null }

interface AircraftContextResponse {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  year?: number | null
  serial_number?: string | null
  engine_make?: string | null
  engine_model?: string | null
  owner_customer?: {
    id: string
    name: string
    company?: string | null
    email?: string | null
    phone?: string | null
  } | null
  linked_customers?: Array<{
    id: string
    relationship?: string | null
    is_primary?: boolean | null
    customer: {
      id: string
      name: string
      company?: string | null
      email?: string | null
      phone?: string | null
    } | null
  }>
}

interface Props {
  aircraft: Aircraft[]
  initialAircraftId?: string
  onOrderCreated?: (order: unknown) => void
}

export function PartSearchPanel({ aircraft, initialAircraftId, onOrderCreated }: Props) {
  const [query, setQuery] = useState('')
  const [aircraftId, setAircraftId] = useState<string>(initialAircraftId ?? (aircraft.length === 1 ? aircraft[0].id : ''))
  const [busy, setBusy] = useState(false)
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clickedBusyId, setClickedBusyId] = useState<string | null>(null)
  const [aircraftDetails, setAircraftDetails] = useState<AircraftContextResponse | null>(null)
  const [aircraftLoading, setAircraftLoading] = useState(false)

  useEffect(() => {
    setAircraftId(prev => prev || initialAircraftId || (aircraft.length === 1 ? aircraft[0].id : ''))
  }, [aircraft, initialAircraftId])

  useEffect(() => {
    let active = true

    async function loadAircraftDetails(id: string) {
      setAircraftLoading(true)
      try {
        const resp = await fetch(`/api/aircraft/${id}`)
        const payload = await resp.json().catch(() => ({}))
        if (!active) return
        if (!resp.ok) {
          throw new Error(payload.error ?? 'Failed to load aircraft details')
        }
        setAircraftDetails(payload)
      } catch {
        if (active) {
          setAircraftDetails(null)
        }
      } finally {
        if (active) {
          setAircraftLoading(false)
        }
      }
    }

    if (!aircraftId) {
      setAircraftDetails(null)
      setAircraftLoading(false)
      return () => {
        active = false
      }
    }

    void loadAircraftDetails(aircraftId)
    return () => {
      active = false
    }
  }, [aircraftId])

  const selectedAircraft = aircraft.find(item => item.id === aircraftId) ?? null

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
          const orderAircraft = aircraftId
            ? {
                id: aircraftId,
                tail_number: aircraftDetails?.tail_number ?? selectedAircraft?.tail_number ?? 'Aircraft',
              }
            : null
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
            aircraft: orderAircraft,
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

  const libraryMatches = response?.libraryMatches ?? []

  return (
    <div className="space-y-4">
      {/* Search form */}
      <form onSubmit={runSearch} className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-border bg-card">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by part number or description (e.g. oil filter, spark plugs, brake pads)"
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

      {(aircraftLoading || aircraftDetails || selectedAircraft) && (
        <AircraftContextCard
          aircraft={aircraftDetails}
          fallbackAircraft={selectedAircraft}
          loading={aircraftLoading}
        />
      )}

      {/* Loading state with AI indicator */}
      {busy && aircraftId && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-200 bg-brand-50/50 text-sm">
          <Sparkles className="h-4 w-4 text-brand-600 animate-pulse" />
          <span className="text-brand-700">AI is identifying the exact part numbers for your aircraft…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {response && (
        <>
          {/* AI Resolution Card */}
          {response.aiResolution && <AIResolutionCard resolution={response.aiResolution} />}

          {libraryMatches.length > 0 && (
            <LibraryMatchesCard matches={libraryMatches} />
          )}

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

function AircraftContextCard({
  aircraft,
  fallbackAircraft,
  loading,
}: {
  aircraft: AircraftContextResponse | null
  fallbackAircraft: Aircraft | null
  loading: boolean
}) {
  const primaryCustomer =
    aircraft?.linked_customers?.find(item => item.is_primary)?.customer ??
    aircraft?.owner_customer ??
    aircraft?.linked_customers?.find(item => item.customer)?.customer ??
    null

  const makeModel = [aircraft?.make ?? fallbackAircraft?.make, aircraft?.model ?? fallbackAircraft?.model]
    .filter(Boolean)
    .join(' ')
  const engine = [aircraft?.engine_make, aircraft?.engine_model].filter(Boolean).join(' ')

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <Plane className="h-4 w-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {aircraft?.tail_number ?? fallbackAircraft?.tail_number ?? 'Selected aircraft'}
            </h3>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {makeModel && (
              <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {[(aircraft?.year ?? fallbackAircraft?.year) || null, makeModel].filter(Boolean).join(' ')}
              </span>
            )}
          </div>

          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
            <div className="flex items-start gap-2">
              <Wrench className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Engine context</p>
                <p>{engine || 'No engine details on file yet'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Customer link</p>
                <p>
                  {primaryCustomer
                    ? [primaryCustomer.name, primaryCustomer.company].filter(Boolean).join(' · ')
                    : 'No owner or primary customer linked'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Archive className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <p className="font-medium text-foreground">Aircraft file</p>
                <p>{aircraft?.serial_number ? `Serial ${aircraft.serial_number}` : 'Using basic aircraft profile'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AI Resolution Card ────────────────────────────────────────────────────

function AIResolutionCard({ resolution }: { resolution: AIResolutionInfo }) {
  const confidenceColors = {
    high: 'border-emerald-200 bg-emerald-50/80',
    medium: 'border-amber-200 bg-amber-50/80',
    low: 'border-slate-200 bg-slate-50/80',
  }
  const confidenceDot = {
    high: 'bg-emerald-500',
    medium: 'bg-amber-500',
    low: 'bg-slate-400',
  }

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', confidenceColors[resolution.confidence])}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-brand-100 flex-shrink-0">
          <Sparkles className="h-4 w-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-foreground">AI Part Identification</h3>
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className={cn('w-1.5 h-1.5 rounded-full', confidenceDot[resolution.confidence])} />
              {resolution.confidence} confidence
            </span>
          </div>

          {/* Part numbers */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {resolution.partNumbers.map((pn, i) => (
              <span
                key={pn}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-semibold border',
                  i === 0
                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                    : 'bg-white text-foreground border-border'
                )}
              >
                <Tag className="h-3 w-3" />
                {pn}
                {i === 0 && <span className="text-[9px] font-sans font-medium ml-1 text-brand-500">PRIMARY</span>}
              </span>
            ))}
            {resolution.alternates.length > 0 && (
              <>
                {resolution.alternates.map(alt => (
                  <span key={alt} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border bg-white/60 text-muted-foreground border-border/50">
                    {alt}
                    <span className="text-[9px] font-sans">ALT</span>
                  </span>
                ))}
              </>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-foreground/80 leading-relaxed">{resolution.description}</p>

          {/* System + Reasoning */}
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              {resolution.system.replace(/_/g, ' ')}
            </span>
            <span className="truncate">{resolution.reasoning}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LibraryMatchesCard({ matches }: { matches: LibraryMatch[] }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Archive className="h-4 w-4 text-emerald-700" />
        <div>
          <h3 className="text-sm font-semibold text-emerald-900">Already in your parts library</h3>
          <p className="text-xs text-emerald-700">
            Prior shop usage and saved pricing, surfaced before external vendor clicks.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {matches.map(match => (
          <div key={match.id} className="rounded-lg border border-emerald-200 bg-white/80 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-emerald-100 bg-emerald-50">
                {match.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={match.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Archive className="h-5 w-5 text-emerald-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{match.title}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">P/N {match.partNumber}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                    {match.matchReason.replace('_', ' ')}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {match.preferredVendor && <span>{match.preferredVendor}</span>}
                  {match.category && <span>{match.category}</span>}
                  {match.condition && <span>{match.condition}</span>}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="font-semibold text-foreground">
                    {formatPrice(match.sellPrice ?? match.basePrice ?? null, match.currency)}
                  </span>
                  <span className="text-muted-foreground">
                    used {match.usageCount} time{match.usageCount === 1 ? '' : 's'}
                  </span>
                  {match.lastOrderedAt && (
                    <span className="text-muted-foreground">last ordered {formatRelativeDate(match.lastOrderedAt)}</span>
                  )}
                </div>

                {match.vendorUrl && (
                  <div className="mt-2">
                    <a
                      href={match.vendorUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
                    >
                      Open saved vendor link
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Offer Card ─────────────────────────────────────────────────────────────

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

function formatPrice(value: number | null, currency?: string | null): string {
  if (value == null) return 'No saved price'
  return `$${value.toFixed(2)}${currency && currency !== 'USD' ? ` ${currency}` : ''}`
}

function formatRelativeDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  const days = Math.round((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}
