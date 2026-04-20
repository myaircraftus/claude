'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  ArrowRight,
  BookOpen,
  Brain,
  Download,
  FileStack,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Text,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { MANUAL_MARKETPLACE_TYPES, PART_MARKETPLACE_CATEGORIES } from '@/lib/marketplace/demo-data'
import {
  documentMatchesMarketplaceSearch,
  formatMarketplacePrice,
  getDocumentTypeLabel,
  partMatchesMarketplaceSearch,
} from '@/lib/marketplace/service'
import type {
  AircraftTargetOption,
  DocumentAccessChoice,
  InjectionTargetScope,
  MarketplaceDocumentInjectResult,
  MarketplaceDocumentListing,
  MarketplaceMode,
  MarketplacePartListing,
} from '@/lib/marketplace/types'
import { cn } from '@/lib/utils'

interface Props {
  mode: MarketplaceMode
  onModeChange: (mode: MarketplaceMode) => void
  browsePartListings: MarketplacePartListing[]
  browseDocumentListings: MarketplaceDocumentListing[]
  aircraftOptions: AircraftTargetOption[]
  currentAircraftId: string | null
  onPartContactClick: (
    listing: MarketplacePartListing,
    method: 'call' | 'text' | 'email'
  ) => Promise<void> | void
  onDocumentInjectSuccess: (
    listing: MarketplaceDocumentListing,
    result: MarketplaceDocumentInjectResult
  ) => void
}

const CONDITIONS = [
  { id: 'all', label: 'All conditions' },
  { id: 'new', label: 'New' },
  { id: 'new_surplus', label: 'New Surplus' },
  { id: 'overhauled', label: 'Overhauled' },
  { id: 'serviceable', label: 'Serviceable' },
  { id: 'as_removed', label: 'As Removed' },
  { id: 'used', label: 'Used' },
  { id: 'for_repair', label: 'For Repair' },
] as const

function openBuyerContact(listing: MarketplacePartListing, method: 'call' | 'text' | 'email') {
  if (method === 'call' && listing.sellerPhone) {
    window.open(`tel:${listing.sellerPhone}`, '_self')
  }
  if (method === 'text' && listing.sellerTextNumber) {
    window.open(`sms:${listing.sellerTextNumber}`, '_self')
  }
  if (method === 'email' && listing.sellerEmail) {
    window.open(`mailto:${listing.sellerEmail}?subject=${encodeURIComponent(`Marketplace inquiry: ${listing.title}`)}`, '_self')
  }
}

export function MarketplaceBrowse({
  mode,
  onModeChange,
  browsePartListings,
  browseDocumentListings,
  aircraftOptions,
  currentAircraftId,
  onPartContactClick,
  onDocumentInjectSuccess,
}: Props) {
  const [partSearch, setPartSearch] = useState('')
  const [documentSearch, setDocumentSearch] = useState('')
  const deferredPartSearch = useDeferredValue(partSearch)
  const deferredDocumentSearch = useDeferredValue(documentSearch)
  const [partCategory, setPartCategory] = useState<string>('all')
  const [partManufacturer, setPartManufacturer] = useState<string>('all')
  const [partCondition, setPartCondition] = useState<string>('all')
  const [availability, setAvailability] = useState<'all' | 'available' | 'pending'>('all')
  const [sortBy, setSortBy] = useState<'relevance' | 'newest' | 'price-low' | 'price-high' | 'most-viewed'>('relevance')
  const [partLocation, setPartLocation] = useState('')
  const [minimumPrice, setMinimumPrice] = useState('')
  const [maximumPrice, setMaximumPrice] = useState('')
  const [traceOnly, setTraceOnly] = useState(false)
  const [tagOnly, setTagOnly] = useState(false)
  const [mediaOnly, setMediaOnly] = useState(false)

  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('all')
  const [documentManufacturer, setDocumentManufacturer] = useState<string>('all')
  const [selectedPart, setSelectedPart] = useState<MarketplacePartListing | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<MarketplaceDocumentListing | null>(null)
  const [accessDocument, setAccessDocument] = useState<MarketplaceDocumentListing | null>(null)

  const partManufacturers = useMemo(
    () =>
      Array.from(new Set(browsePartListings.map((listing) => listing.manufacturer))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [browsePartListings]
  )

  const documentManufacturers = useMemo(
    () =>
      Array.from(
        new Set(
          browseDocumentListings
            .map((listing) => listing.manufacturer)
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [browseDocumentListings]
  )

  const filteredParts = useMemo(() => {
    const filtered = browsePartListings.filter((listing) => {
      if (!partMatchesMarketplaceSearch(listing, deferredPartSearch)) return false
      if (partCategory !== 'all' && listing.category !== partCategory) return false
      if (partManufacturer !== 'all' && listing.manufacturer !== partManufacturer) return false
      if (partCondition !== 'all' && listing.condition !== partCondition) return false
      if (availability !== 'all' && listing.status !== availability) return false
      if (partLocation.trim() && !listing.location.toLowerCase().includes(partLocation.trim().toLowerCase())) return false
      if (minimumPrice.trim() && listing.priceCents < Number(minimumPrice) * 100) return false
      if (maximumPrice.trim() && listing.priceCents > Number(maximumPrice) * 100) return false
      if (traceOnly && !listing.traceDocsAvailable) return false
      if (tagOnly && !listing.tagAvailable) return false
      if (mediaOnly && listing.media.length === 0) return false
      return true
    })

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return a.priceCents - b.priceCents
        case 'price-high':
          return b.priceCents - a.priceCents
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'most-viewed':
          return b.views - a.views
        default: {
          const aScore = (a.priorityRanked ? 50 : 0) + a.views + a.contactMetrics.total
          const bScore = (b.priorityRanked ? 50 : 0) + b.views + b.contactMetrics.total
          return bScore - aScore
        }
      }
    })
  }, [
    availability,
    browsePartListings,
    deferredPartSearch,
    mediaOnly,
    maximumPrice,
    minimumPrice,
    partCategory,
    partCondition,
    partLocation,
    partManufacturer,
    sortBy,
    tagOnly,
    traceOnly,
  ])

  const filteredDocuments = useMemo(() => {
    return browseDocumentListings.filter((listing) => {
      if (!documentMatchesMarketplaceSearch(listing, deferredDocumentSearch)) return false
      if (documentTypeFilter !== 'all' && listing.documentType !== documentTypeFilter) return false
      if (documentManufacturer !== 'all' && listing.manufacturer !== documentManufacturer) return false
      return true
    })
  }, [browseDocumentListings, deferredDocumentSearch, documentManufacturer, documentTypeFilter])

  const featuredParts = filteredParts.filter((listing) => listing.priorityRanked).slice(0, 3)
  const mostViewedParts = [...filteredParts].sort((a, b) => b.views - a.views).slice(0, 3)
  const recentParts = [...filteredParts]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)

  const mostRelevantDocuments = [...filteredDocuments]
    .sort((a, b) => {
      const aScore = (a.previewAvailable ? 30 : 0) + (a.pageCount ?? 0)
      const bScore = (b.previewAvailable ? 30 : 0) + (b.pageCount ?? 0)
      return bScore - aScore
    })
    .slice(0, 3)

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_40%,#f3f8ff_100%)] p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => onModeChange('parts')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  mode === 'parts'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Parts Marketplace
              </button>
              <button
                type="button"
                onClick={() => onModeChange('manuals')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  mode === 'manuals'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Manuals &amp; Catalogs
              </button>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                {mode === 'parts'
                  ? 'Find trusted aircraft parts fast, then contact the seller directly.'
                  : 'Browse technical manuals and inject the right document into your aircraft workspace.'}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                {mode === 'parts'
                  ? 'Search by part number, manufacturer, condition, or plain-English intent. Seller plans stay lightweight and direct contact keeps the flow fast.'
                  : 'Manuals and parts catalogs stay first-class: identify the document, control access, and add it into your workspace so it becomes searchable with AI.'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatPill
              label={mode === 'parts' ? 'Live listings' : 'Published manuals'}
              value={mode === 'parts' ? String(filteredParts.length) : String(filteredDocuments.length)}
              icon={mode === 'parts' ? Wrench : BookOpen}
            />
            <StatPill
              label={mode === 'parts' ? 'Direct contact' : 'Inject ready'}
              value={mode === 'parts' ? 'Call · Text · Email' : `${filteredDocuments.filter((item) => item.injectable).length} docs`}
              icon={mode === 'parts' ? Phone : Sparkles}
            />
            <StatPill
              label={mode === 'parts' ? 'Trust signals' : 'AI-ready after inject'}
              value={mode === 'parts' ? 'Trace · tags · views' : 'Search · retrieval · Ask AI'}
              icon={mode === 'parts' ? ShieldCheck : Brain}
            />
          </div>
        </div>

        {mode === 'parts' ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={partSearch}
                  onChange={(event) => setPartSearch(event.target.value)}
                  placeholder="Search part number, manufacturer, or ask in plain English"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
                />
              </div>
              <Select value={partCategory} onValueChange={setPartCategory}>
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm lg:w-56">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {PART_MARKETPLACE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={partManufacturer} onValueChange={setPartManufacturer}>
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm lg:w-56">
                  <SelectValue placeholder="Manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All manufacturers</SelectItem>
                  {partManufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={partCondition} onValueChange={setPartCondition}>
                <SelectTrigger className="h-10 w-[180px] rounded-xl border-slate-200 bg-white shadow-sm">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((condition) => (
                    <SelectItem key={condition.id} value={condition.id}>
                      {condition.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={availability} onValueChange={(value) => setAvailability(value as typeof availability)}>
                <SelectTrigger className="h-10 w-[170px] rounded-xl border-slate-200 bg-white shadow-sm">
                  <SelectValue placeholder="Availability" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All availability</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="h-10 w-[180px] rounded-xl border-slate-200 bg-white shadow-sm">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Best match</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="price-low">Price: low to high</SelectItem>
                  <SelectItem value="price-high">Price: high to low</SelectItem>
                  <SelectItem value="most-viewed">Most viewed</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={partLocation}
                onChange={(event) => setPartLocation(event.target.value)}
                placeholder="Location"
                className="h-10 w-[150px] rounded-xl border-slate-200 bg-white shadow-sm"
              />
              <Input
                value={minimumPrice}
                onChange={(event) => setMinimumPrice(event.target.value)}
                placeholder="Min price"
                className="h-10 w-[120px] rounded-xl border-slate-200 bg-white shadow-sm"
                inputMode="decimal"
              />
              <Input
                value={maximumPrice}
                onChange={(event) => setMaximumPrice(event.target.value)}
                placeholder="Max price"
                className="h-10 w-[120px] rounded-xl border-slate-200 bg-white shadow-sm"
                inputMode="decimal"
              />
              <FilterChip active={traceOnly} onClick={() => setTraceOnly((value) => !value)}>
                Trace docs
              </FilterChip>
              <FilterChip active={tagOnly} onClick={() => setTagOnly((value) => !value)}>
                Certification / tag
              </FilterChip>
              <FilterChip active={mediaOnly} onClick={() => setMediaOnly((value) => !value)}>
                Media attached
              </FilterChip>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={documentSearch}
                  onChange={(event) => setDocumentSearch(event.target.value)}
                  placeholder="Search title, document number, revision, aircraft type, or manufacturer"
                  className="h-11 rounded-xl border-slate-200 bg-white pl-10 shadow-sm"
                />
              </div>
              <Select value={documentTypeFilter} onValueChange={setDocumentTypeFilter}>
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm lg:w-64">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All document types</SelectItem>
                  {MANUAL_MARKETPLACE_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={documentManufacturer} onValueChange={setDocumentManufacturer}>
                <SelectTrigger className="h-11 w-full rounded-xl border-slate-200 bg-white shadow-sm lg:w-56">
                  <SelectValue placeholder="Manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All manufacturers</SelectItem>
                  {documentManufacturers.map((manufacturer) => (
                    <SelectItem key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <p className="font-medium text-slate-900">Inject explanation</p>
              <p className="mt-1 leading-6">
                Inject adds this document into your aircraft or workspace records inside myaircraft.us.
                The file is stored in your system, indexed for AI search, and becomes searchable in your assistant workflows.
              </p>
            </div>
          </div>
        )}
      </section>

      {mode === 'parts' ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr_1fr]">
            <BrowseFeatureColumn
              title="Featured parts"
              description="Priority-ranked listings with the strongest demand signals."
              items={featuredParts.length > 0 ? featuredParts : filteredParts.slice(0, 3)}
              onSelect={setSelectedPart}
            />
            <BrowseFeatureColumn
              title="Most viewed"
              description="Listings drawing the most attention right now."
              items={mostViewedParts}
              onSelect={setSelectedPart}
            />
            <BrowseFeatureColumn
              title="Recently listed"
              description="Fresh inventory added to the marketplace."
              items={recentParts}
              onSelect={setSelectedPart}
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Browse parts</h3>
                <p className="text-sm text-slate-600">
                  Search by part number, manufacturer, condition, price, and trust documentation.
                </p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                {filteredParts.length} results
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredParts.map((listing) => (
                <PartListingCard
                  key={listing.id}
                  listing={listing}
                  onViewDetails={() => setSelectedPart(listing)}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            {mostRelevantDocuments.map((listing) => (
              <DocumentHighlightCard
                key={listing.id}
                listing={listing}
                onView={() => setSelectedDocument(listing)}
                onAccess={() => setAccessDocument(listing)}
              />
            ))}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Browse manuals &amp; catalogs</h3>
                <p className="text-sm text-slate-600">
                  Search technical documents by title, manufacturer, document number, revision, or aircraft applicability.
                </p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                {filteredDocuments.length} results
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDocuments.map((listing) => (
                <DocumentListingCard
                  key={listing.id}
                  listing={listing}
                  onView={() => setSelectedDocument(listing)}
                  onAccess={() => setAccessDocument(listing)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      <PartDetailDialog
        listing={selectedPart}
        open={selectedPart !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPart(null)
        }}
        similarListings={
          selectedPart
            ? browsePartListings
                .filter((item) => {
                  if (item.id === selectedPart.id) return false
                  return item.category === selectedPart.category || item.manufacturer === selectedPart.manufacturer
                })
                .slice(0, 3)
            : []
        }
        onContact={async (method) => {
          if (!selectedPart) return
          openBuyerContact(selectedPart, method)
          await onPartContactClick(selectedPart, method)
        }}
      />

      <DocumentDetailDialog
        listing={selectedDocument}
        open={selectedDocument !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDocument(null)
        }}
        onAccess={(listing) => {
          setSelectedDocument(null)
          setAccessDocument(listing)
        }}
      />

      <DocumentAccessDialog
        listing={accessDocument}
        aircraftOptions={aircraftOptions}
        currentAircraftId={currentAircraftId}
        open={accessDocument !== null}
        onOpenChange={(open) => {
          if (!open) setAccessDocument(null)
        }}
        onSuccess={(listing, result) => {
          onDocumentInjectSuccess(listing, result)
          setAccessDocument(null)
        }}
      />
    </div>
  )
}

function StatPill({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-700">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      )}
    >
      {children}
    </button>
  )
}

function BrowseFeatureColumn({
  title,
  description,
  items,
  onSelect,
}: {
  title: string
  description: string
  items: MarketplacePartListing[]
  onSelect: (listing: MarketplacePartListing) => void
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 space-y-1">
        <h3 className="font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <div className="space-y-3">
        {items.map((listing) => (
          <button
            key={listing.id}
            type="button"
            onClick={() => onSelect(listing)}
            className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">{listing.title}</p>
              <p className="text-xs text-slate-600">
                {listing.partNumber} · {listing.manufacturer}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{formatMarketplacePrice(listing.priceCents)}</p>
              <p className="text-xs text-slate-500">{listing.views} views</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function PartListingCard({
  listing,
  onViewDetails,
}: {
  listing: MarketplacePartListing
  onViewDetails: () => void
}) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      {listing.media[0] && (
        <div className="border-b border-slate-200 bg-slate-100">
          {listing.media[0].type === 'video' ? (
            <video src={listing.media[0].url} className="aspect-[16/10] w-full object-cover" muted playsInline />
          ) : (
            <Image
              src={listing.media[0].url}
              alt={listing.media[0].alt}
              width={1600}
              height={1000}
              className="aspect-[16/10] w-full object-cover"
            />
          )}
        </div>
      )}
      <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc_0%,#eef4ff_100%)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                {listing.category}
              </Badge>
              {listing.priorityRanked && (
                <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                  Priority ranked
                </Badge>
              )}
            </div>
            <h4 className="mt-3 text-lg font-semibold text-slate-950">{listing.title}</h4>
            <p className="mt-1 text-sm text-slate-600">
              {listing.partNumber}
              {listing.alternatePartNumber ? ` · Alt ${listing.alternatePartNumber}` : ''}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Price</p>
            <p className="text-lg font-semibold text-slate-900">{formatMarketplacePrice(listing.priceCents)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm leading-6 text-slate-600 line-clamp-3">
          {listing.description ?? listing.sellerNotes ?? 'Seller-supplied part listing'}
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoTile label="Condition" value={humanizeCondition(listing.condition)} />
          <InfoTile label="Quantity" value={String(listing.quantity)} />
          <InfoTile label="Manufacturer" value={listing.manufacturer} />
          <InfoTile label="Location" value={listing.location} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
          {listing.traceDocsAvailable && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
              Trace docs available
            </span>
          )}
          {listing.tagAvailable && (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
              Certification / tag
            </span>
          )}
          {listing.media.length > 0 && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Media attached
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-600">
          <div>
            <p className="font-medium text-slate-900">{listing.sellerName}</p>
            <p>{listing.views} views · {listing.contactMetrics.total} contact clicks</p>
          </div>
          <Button onClick={onViewDetails}>
            View details
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  )
}

function DocumentHighlightCard({
  listing,
  onView,
  onAccess,
}: {
  listing: MarketplaceDocumentListing
  onView: () => void
  onAccess: () => void
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
            {getDocumentTypeLabel(listing.documentType)}
          </Badge>
          <h3 className="text-lg font-semibold text-slate-950">{listing.title}</h3>
          <p className="text-sm text-slate-600">
            {listing.manufacturer ?? 'Technical source'}
            {listing.aircraftApplicability ? ` · ${listing.aircraftApplicability}` : ''}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Access</p>
          <p className="text-sm font-semibold text-slate-900">
            {listing.accessType === 'paid' ? formatMarketplacePrice(listing.priceCents) : 'Get Access'}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        {listing.description ?? 'Manual and catalog metadata ready for download or workspace injection.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <DocumentCapabilityBadge active={listing.previewAvailable}>Preview info</DocumentCapabilityBadge>
        <DocumentCapabilityBadge active={listing.downloadable}>Download PDF</DocumentCapabilityBadge>
        <DocumentCapabilityBadge active={listing.injectable}>Inject to workspace</DocumentCapabilityBadge>
        <DocumentCapabilityBadge active={listing.isSearchableAfterInject}>AI-search-ready after inject</DocumentCapabilityBadge>
      </div>
      <div className="mt-5 flex gap-2">
        <Button variant="outline" onClick={onView}>
          View details
        </Button>
        <Button onClick={onAccess}>Get access</Button>
      </div>
    </div>
  )
}

function DocumentListingCard({
  listing,
  onView,
  onAccess,
}: {
  listing: MarketplaceDocumentListing
  onView: () => void
  onAccess: () => void
}) {
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {getDocumentTypeLabel(listing.documentType)}
            </Badge>
            <h4 className="mt-3 text-lg font-semibold text-slate-950">{listing.title}</h4>
            <p className="mt-1 text-sm text-slate-600">
              {listing.manufacturer ?? 'Technical source'}
              {listing.revision ? ` · Rev ${listing.revision}` : ''}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'border-slate-200',
              listing.accessType === 'free' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
              listing.accessType === 'paid' && 'bg-amber-50 text-amber-700 border-amber-200',
              listing.accessType === 'private' && 'bg-slate-50 text-slate-600'
            )}
          >
            {listing.accessType === 'paid'
              ? formatMarketplacePrice(listing.priceCents)
              : listing.accessType === 'free'
                ? 'Free access'
                : 'Private'}
          </Badge>
        </div>

        <p className="text-sm leading-6 text-slate-600 line-clamp-3">
          {listing.description ?? 'Manual and catalog document listing'}
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoTile label="Applicability" value={listing.aircraftApplicability ?? 'General'} />
          <InfoTile label="Pages" value={listing.pageCount ? String(listing.pageCount) : 'Unknown'} />
          <InfoTile label="Seller / source" value={listing.sellerName} />
          <InfoTile label="Document number" value={listing.documentNumber ?? '—'} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <DocumentCapabilityBadge active={listing.downloadable}>Downloadable</DocumentCapabilityBadge>
          <DocumentCapabilityBadge active={listing.injectable}>Injectable</DocumentCapabilityBadge>
          <DocumentCapabilityBadge active={listing.previewAvailable}>Preview available</DocumentCapabilityBadge>
          <DocumentCapabilityBadge active={listing.isSearchableAfterInject}>AI-search-ready</DocumentCapabilityBadge>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onView}>
            View details
          </Button>
          <Button className="flex-1" onClick={onAccess}>
            Get access
          </Button>
        </div>
      </div>
    </article>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  )
}

function DocumentCapabilityBadge({
  active,
  children,
}: {
  active: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1',
        active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
      )}
    >
      {children}
    </span>
  )
}

function PartDetailDialog({
  listing,
  open,
  onOpenChange,
  similarListings,
  onContact,
}: {
  listing: MarketplacePartListing | null
  open: boolean
  onOpenChange: (open: boolean) => void
  similarListings: MarketplacePartListing[]
  onContact: (method: 'call' | 'text' | 'email') => Promise<void> | void
}) {
  if (!listing) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-6 lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col justify-between gap-6">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {listing.category}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                    {humanizeCondition(listing.condition)}
                  </Badge>
                  {listing.traceDocsAvailable && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Trace docs
                    </Badge>
                  )}
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-950">{listing.title}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {listing.partNumber}
                  {listing.alternatePartNumber ? ` · Alt ${listing.alternatePartNumber}` : ''}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <InfoTile label="Manufacturer" value={listing.manufacturer} />
                <InfoTile label="Quantity" value={String(listing.quantity)} />
                <InfoTile label="Location" value={listing.location} />
                <InfoTile label="Views" value={String(listing.views)} />
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Part narrative</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {listing.description ?? listing.sellerNotes ?? 'Seller-provided part description.'}
                </p>
              </div>

              {listing.media.length > 0 && (
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Image gallery</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {listing.media.map((media) => (
                      <div key={media.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {media.type === 'video' ? (
                          <video src={media.url} controls className="aspect-[4/3] w-full bg-slate-950 object-cover" />
                        ) : (
                          <Image
                            src={media.url}
                            alt={media.alt}
                            width={1200}
                            height={900}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        )}
                        <div className="px-3 py-2 text-xs text-slate-600">{media.alt}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {similarListings.length > 0 && (
                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Similar parts</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {similarListings.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <p className="font-medium text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.partNumber}</p>
                        <p className="mt-2 text-sm text-slate-700">{formatMarketplacePrice(item.priceCents)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5 p-6">
            <DialogHeader className="space-y-3 text-left">
              <DialogTitle className="text-xl">Contact seller directly</DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                This marketplace uses a simple direct-contact model. No in-app messaging, checkout,
                escrow, or shipping workflow is inserted between you and the seller.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Seller</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{listing.sellerName}</p>
              <p className="mt-1 text-sm text-slate-600">
                {listing.contactMetrics.total} buyer contact clicks · {listing.status}
              </p>
            </div>

            <div className="grid gap-3">
              <Button onClick={() => onContact('call')} disabled={!listing.sellerPhone}>
                <Phone className="h-4 w-4" />
                Call Seller
              </Button>
              <Button variant="outline" onClick={() => onContact('text')} disabled={!listing.sellerTextNumber}>
                <Text className="h-4 w-4" />
                Text Seller
              </Button>
              <Button variant="outline" onClick={() => onContact('email')} disabled={!listing.sellerEmail}>
                <Mail className="h-4 w-4" />
                Email Seller
              </Button>
            </div>

            <Separator />

            <div className="grid gap-3">
              <InfoTile label="Trace docs" value={listing.traceDocsAvailable ? 'Available' : 'Not provided'} />
              <InfoTile label="Certification / tag" value={listing.tagAvailable ? 'Available' : 'Not provided'} />
              <InfoTile label="Fits / applicability" value={listing.fitsApplicability ?? 'Seller notes only'} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DocumentDetailDialog({
  listing,
  open,
  onOpenChange,
  onAccess,
}: {
  listing: MarketplaceDocumentListing | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAccess: (listing: MarketplaceDocumentListing) => void
}) {
  if (!listing) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
              {getDocumentTypeLabel(listing.documentType)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {listing.accessType === 'paid' ? formatMarketplacePrice(listing.priceCents) : 'Get Access'}
            </Badge>
          </div>
          <DialogTitle className="text-2xl">{listing.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            {listing.description ?? 'Marketplace technical document listing'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoTile label="Manufacturer" value={listing.manufacturer ?? 'Unknown'} />
          <InfoTile label="Aircraft applicability" value={listing.aircraftApplicability ?? 'General'} />
          <InfoTile label="Revision" value={listing.revision ?? '—'} />
          <InfoTile label="Document number" value={listing.documentNumber ?? '—'} />
          <InfoTile label="Pages" value={listing.pageCount ? String(listing.pageCount) : 'Unknown'} />
          <InfoTile label="Seller / source" value={listing.sellerName} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-900">Inject helper</p>
          <p className="mt-1">
            Inject adds this document into your aircraft or workspace records inside myaircraft.us.
            The file is stored in your system, indexed for AI search, and becomes searchable in your assistant workflows.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => onAccess(listing)}>Get access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentAccessDialog({
  listing,
  aircraftOptions,
  currentAircraftId,
  open,
  onOpenChange,
  onSuccess,
}: {
  listing: MarketplaceDocumentListing | null
  aircraftOptions: AircraftTargetOption[]
  currentAircraftId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: (listing: MarketplaceDocumentListing, result: MarketplaceDocumentInjectResult) => void
}) {
  const [action, setAction] = useState<DocumentAccessChoice>('download')
  const [targetScope, setTargetScope] = useState<InjectionTargetScope>(
    currentAircraftId ? 'current_aircraft' : 'workspace'
  )
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(currentAircraftId ?? aircraftOptions[0]?.id ?? '')
  const [actionError, setActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canDownload = listing ? listing.downloadable && listing.accessType !== 'paid' : false
  const canInject = listing ? listing.injectable && listing.accessType !== 'paid' : false

  useEffect(() => {
    if (!listing) return
    if (canDownload && canInject) {
      setAction('download_and_inject')
      return
    }
    if (canInject) {
      setAction('inject')
      return
    }
    setAction('download')
  }, [canDownload, canInject, listing])

  if (!listing) return null
  const selectedListing = listing

  async function handleSubmit() {
    setActionError(null)
    setSubmitting(true)
    try {
      if (action === 'download') {
        const res = await fetch(`/api/marketplace/download/${selectedListing.id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Download failed')
        if (json.url) {
          window.open(json.url, '_blank', 'noopener,noreferrer')
        }
        onOpenChange(false)
        return
      }

      const scope = targetScope === 'current_aircraft' ? 'aircraft' : targetScope
      const res = await fetch(`/api/marketplace/documents/${selectedListing.id}/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          targetScope: scope,
          targetAircraftId:
            scope === 'aircraft'
              ? targetScope === 'current_aircraft'
                ? currentAircraftId
                : selectedAircraftId
              : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Inject failed')
      if (json.downloadUrl || json.download_url) {
        window.open(json.downloadUrl ?? json.download_url, '_blank', 'noopener,noreferrer')
      }
      onSuccess(selectedListing, {
        injectedDocumentId:
          json.injectedDocumentId ??
          json.injected_document_id ??
          json.injectedDocument?.id ??
          json.inject_event?.id,
        targetScope: scope,
        aircraftId:
          scope === 'aircraft'
            ? targetScope === 'current_aircraft'
              ? currentAircraftId
              : selectedAircraftId
            : null,
        downloadUrl: json.downloadUrl ?? json.download_url ?? null,
      } as MarketplaceDocumentInjectResult)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Access action failed')
    } finally {
      setSubmitting(false)
    }
  }

  const actionDisabled =
    listing.accessType === 'paid' ||
    (action === 'download' && !canDownload) ||
    (action === 'inject' && !canInject) ||
    (action === 'download_and_inject' && !(canDownload && canInject))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="text-2xl">Get access to {listing.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-600">
            Download the source PDF, inject it into your aircraft or workspace, or do both so it becomes searchable with AI later.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-900">What inject means</p>
          <p className="mt-1">
            Inject adds this document into your aircraft or workspace records inside myaircraft.us.
            The file is stored in your system, indexed for AI search, and becomes searchable in your assistant workflows.
          </p>
        </div>

        <div className="grid gap-3">
          <ActionChoice
            active={action === 'download'}
            disabled={!canDownload || listing.accessType === 'paid'}
            title="Download PDF"
            description="Download the original source PDF only."
            icon={Download}
            onClick={() => setAction('download')}
          />
          <ActionChoice
            active={action === 'download_and_inject'}
            disabled={!(canDownload && canInject) || listing.accessType === 'paid'}
            title="Download and Inject"
            description="Download the original PDF and also add it into your aircraft/workspace so it can be searched with AI later."
            icon={Sparkles}
            onClick={() => setAction('download_and_inject')}
          />
          <ActionChoice
            active={action === 'inject'}
            disabled={!canInject || listing.accessType === 'paid'}
            title="Inject to Aircraft / Workspace"
            description="Add the document into myaircraft.us without separately downloading the PDF."
            icon={FileStack}
            onClick={() => setAction('inject')}
          />
        </div>

        {(action === 'inject' || action === 'download_and_inject') && (
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="space-y-1">
              <Label>Injection target</Label>
              <p className="text-xs text-slate-500">
                Choose where the document should be added before indexing and retrieval are queued.
              </p>
            </div>
            <Select value={targetScope} onValueChange={(value) => setTargetScope(value as InjectionTargetScope)}>
              <SelectTrigger className="h-11 rounded-xl border-slate-200">
                <SelectValue placeholder="Select target" />
              </SelectTrigger>
              <SelectContent>
                {currentAircraftId && <SelectItem value="current_aircraft">Inject into current aircraft</SelectItem>}
                <SelectItem value="aircraft">Choose another aircraft</SelectItem>
                <SelectItem value="workspace">Save to workspace library</SelectItem>
              </SelectContent>
            </Select>

            {(targetScope === 'aircraft' || targetScope === 'current_aircraft') && (
              <Select value={selectedAircraftId} onValueChange={setSelectedAircraftId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200">
                  <SelectValue placeholder="Select aircraft" />
                </SelectTrigger>
                <SelectContent>
                  {aircraftOptions.map((aircraft) => (
                    <SelectItem key={aircraft.id} value={aircraft.id}>
                      {aircraft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {listing.accessType === 'paid' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This listing is marked as priced access. Billing and checkout are still being finalized, so download and inject remain disabled for paid listings right now.
          </div>
        )}

        {actionError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || actionDisabled}>
            {submitting ? 'Working…' : action === 'download' ? 'Download PDF' : action === 'inject' ? 'Inject document' : 'Download and Inject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActionChoice({
  active,
  disabled,
  title,
  description,
  icon: Icon,
  onClick,
}: {
  active: boolean
  disabled?: boolean
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border px-4 py-4 text-left transition-colors',
        active
          ? 'border-brand-600 bg-brand-50'
          : 'border-slate-200 bg-white hover:border-slate-300',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <div className={cn('rounded-xl p-2', active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600')}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </button>
  )
}

function humanizeCondition(value: MarketplacePartListing['condition']) {
  switch (value) {
    case 'new_surplus':
      return 'New Surplus'
    case 'as_removed':
      return 'As Removed'
    case 'for_repair':
      return 'For Repair'
    default:
      return value.charAt(0).toUpperCase() + value.slice(1)
  }
}
