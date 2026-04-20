'use client'

import { startTransition, useMemo, useState } from 'react'
import { AlertCircle, BookOpen, FileCheck2, Plus, Store, Wrench } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  buildListingUsageSummary,
  buildMarketplaceDocumentListing,
  buildSellerPlanAccountFromRow,
  mapMarketplacePartListingRow,
} from '@/lib/marketplace/service'
import type {
  MarketplaceDocumentInjectResult,
  MarketplaceDocumentListing,
  MarketplaceMode,
  MarketplacePageData,
  MarketplacePartListing,
  MarketplacePrimaryTab,
  SellerPlanAccount,
} from '@/lib/marketplace/types'
import type { Document } from '@/types'
import { MarketplaceBrowse } from '@/components/marketplace/marketplace-browse'
import { MarketplaceSellerCenter } from '@/components/marketplace/marketplace-seller'
import { CreateMarketplaceListingDialog } from '@/components/marketplace/marketplace-wizards'

interface Props {
  data: MarketplacePageData
}

function recalculateUsage(
  sellerPlan: SellerPlanAccount,
  sellerPartListings: MarketplacePartListing[]
) {
  return buildListingUsageSummary(
    {
      ...sellerPlan,
      activeListingsCount: sellerPartListings.filter(
        (listing) => listing.status === 'available' || listing.status === 'pending'
      ).length,
    },
    sellerPartListings
  )
}

export function MarketplaceClient({ data }: Props) {
  const [tab, setTab] = useState<MarketplacePrimaryTab>(data.defaultTab)
  const [mode, setMode] = useState<MarketplaceMode>(data.defaultMode)
  const [sellerPlan, setSellerPlan] = useState<SellerPlanAccount>(data.sellerPlan)
  const [listingUsage, setListingUsage] = useState(data.listingUsage)
  const [browsePartListings, setBrowsePartListings] = useState(data.browsePartListings)
  const [sellerPartListings, setSellerPartListings] = useState(data.sellerPartListings)
  const [browseDocumentListings, setBrowseDocumentListings] = useState(data.browseDocumentListings)
  const [sellerDocumentListings, setSellerDocumentListings] = useState(data.sellerDocumentListings)
  const [moderationDocumentListings, setModerationDocumentListings] = useState(data.moderationDocumentListings)
  const [wizardKind, setWizardKind] = useState<'part' | 'document' | null>(null)
  const [editingPartListing, setEditingPartListing] = useState<MarketplacePartListing | null>(null)
  const [editingDocumentListing, setEditingDocumentListing] = useState<MarketplaceDocumentListing | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [injectSuccess, setInjectSuccess] = useState<{
    listing: MarketplaceDocumentListing
    result: MarketplaceDocumentInjectResult
  } | null>(null)

  const sellerRows = useMemo(() => {
    return {
      parts: sellerPartListings,
      documents: sellerDocumentListings,
    }
  }, [sellerPartListings, sellerDocumentListings])

  function syncPlan(nextPlan: SellerPlanAccount, nextPartListings = sellerPartListings) {
    setSellerPlan(nextPlan)
    setListingUsage(recalculateUsage(nextPlan, nextPartListings))
  }

  function mergePartListing(nextListing: MarketplacePartListing) {
    setSellerPartListings((current) => {
      const existing = current.some((listing) => listing.id === nextListing.id)
      const next = existing
        ? current.map((listing) => (listing.id === nextListing.id ? nextListing : listing))
        : [nextListing, ...current]
      setListingUsage(recalculateUsage(sellerPlan, next))
      return next
    })

    setBrowsePartListings((current) => {
      const alreadyPresent = current.some((listing) => listing.id === nextListing.id)
      const shouldAppearInBrowse = nextListing.status === 'available'
      if (!shouldAppearInBrowse) {
        return current.filter((listing) => listing.id !== nextListing.id)
      }
      if (alreadyPresent) {
        return current.map((listing) => (listing.id === nextListing.id ? nextListing : listing))
      }
      return [nextListing, ...current]
    })
  }

  function mergeDocumentListing(nextListing: MarketplaceDocumentListing) {
    setSellerDocumentListings((current) => {
      const existing = current.some((listing) => listing.id === nextListing.id)
      return existing
        ? current.map((listing) => (listing.id === nextListing.id ? nextListing : listing))
        : [nextListing, ...current]
    })

    setBrowseDocumentListings((current) => {
      const shouldAppearInBrowse = nextListing.listingStatus === 'published'
      if (!shouldAppearInBrowse) {
        return current.filter((listing) => listing.id !== nextListing.id)
      }
      const existing = current.some((listing) => listing.id === nextListing.id)
      return existing
        ? current.map((listing) => (listing.id === nextListing.id ? nextListing : listing))
        : [nextListing, ...current]
    })
  }

  async function handlePartListingMutation(
    listingId: string,
    action: 'mark_sold' | 'relist' | 'archive' | 'mark_pending' | 'duplicate'
  ) {
    setPageError(null)
    try {
      const res = await fetch(`/api/marketplace/parts/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Listing update failed')
      if (json.listing) mergePartListing(mapMarketplacePartListingRow(json.listing as Record<string, unknown>))
      if (json.duplicate) mergePartListing(mapMarketplacePartListingRow(json.duplicate as Record<string, unknown>))
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Listing update failed')
    }
  }

  async function handleDocumentListingMutation(
    listingId: string,
    action: 'submit_review' | 'archive'
  ) {
    setPageError(null)
    try {
      const currentListing = sellerDocumentListings.find((listing) => listing.id === listingId)
      if (!currentListing?.sourceDocumentId) {
        throw new Error('The source document could not be found for this listing.')
      }

      const res = await fetch(`/api/documents/${currentListing.sourceDocumentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'archive'
            ? {
                community_listing: false,
                manual_access: currentListing.accessType,
                marketplace_downloadable: currentListing.downloadable,
                marketplace_injectable: currentListing.injectable,
                marketplace_preview_available: currentListing.previewAvailable,
              }
            : {
                community_listing: true,
                manual_access: currentListing.accessType,
                marketplace_downloadable: currentListing.downloadable,
                marketplace_injectable: currentListing.injectable,
                marketplace_preview_available: currentListing.previewAvailable,
                price_cents: currentListing.accessType === 'paid' ? currentListing.priceCents ?? 0 : null,
              }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Document listing update failed')
      if (!json.document) throw new Error('Document listing updated, but no refreshed listing was returned')
      mergeDocumentListing(
        buildMarketplaceDocumentListing(json.document as Document & {
          aircraft?: { make?: string | null; model?: string | null; tail_number?: string | null } | null
        })
      )
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Document listing update failed')
    }
  }

  async function handlePartContactClick(listing: MarketplacePartListing, method: 'call' | 'text' | 'email') {
    try {
      const res = await fetch(`/api/marketplace/parts/listings/${listing.id}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: method }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.listing) {
        mergePartListing(mapMarketplacePartListingRow(json.listing as Record<string, unknown>))
      }
    } catch {
      // Keep the buyer flow responsive even if metrics logging fails.
    }
  }

  async function handleSellerPlanChange(nextPlanId: SellerPlanAccount['sellerPlan']) {
    setPageError(null)
    try {
      const res = await fetch('/api/marketplace/seller-plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug: nextPlanId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Plan update failed')
      if (json.account) {
        const nextPlan = buildSellerPlanAccountFromRow(
          json.account.organization_id as string,
          json.account as Record<string, unknown>,
          Number(json.usage?.active_listings ?? sellerPlan.activeListingsCount)
        )
        syncPlan(nextPlan)
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Plan update failed')
    }
  }

  async function handleDocumentModeration(
    listingId: string,
    action: 'approve' | 'reject'
  ) {
    setPageError(null)
    try {
      const res = await fetch('/api/marketplace/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: listingId, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Moderation update failed')
      setModerationDocumentListings((current) =>
        current.filter((listing) => listing.id !== listingId)
      )
      if (action === 'approve') {
        const nextListing = sellerDocumentListings.find((listing) => listing.id === listingId)
        if (nextListing) {
          mergeDocumentListing({
            ...nextListing,
            listingStatus: 'published',
          })
        }
      } else {
        const nextListing = sellerDocumentListings.find((listing) => listing.id === listingId)
        if (nextListing) {
          mergeDocumentListing({
            ...nextListing,
            listingStatus: 'rejected',
          })
        }
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Moderation update failed')
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,1))] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.16),transparent_40%),linear-gradient(135deg,#ffffff_0%,#f8fbff_52%,#eef4ff_100%)] px-6 py-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700">
                    Marketplace
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white/80 text-slate-600">
                    Workspace-aware
                  </Badge>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                    Buy parts, share manuals, and inject technical records directly into the aircraft workspace.
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-slate-600">
                    Physical parts use seller-plan gating and direct buyer contact. Manuals and parts catalogs stay first-class, with AI-assisted identification, access controls, and inject flows that make documents searchable inside myaircraft.us.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">Direct contact only</span>
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">Seller plan enforcement</span>
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1">Manual inject + AI search</span>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="lg" className="shadow-[0_12px_30px_rgba(37,99,235,0.2)]">
                      <Plus className="h-4 w-4" />
                      New listing
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingPartListing(null)
                        setEditingDocumentListing(null)
                        setWizardKind('part')
                      }}
                    >
                      <Wrench className="h-4 w-4 text-brand-600" />
                      List a physical part
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingDocumentListing(null)
                        setEditingPartListing(null)
                        setWizardKind('document')
                      }}
                    >
                      <BookOpen className="h-4 w-4 text-brand-600" />
                      List a manual / catalog
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Seller plan</p>
                  <p className="mt-1 font-semibold text-slate-900">{sellerPlan.sellerPlan === 'starter' ? 'Starter' : 'Pro'}</p>
                  <p className="text-xs text-slate-600">
                    {listingUsage.activeCount}
                    {sellerPlan.listingLimit == null ? ' active listings' : ` / ${sellerPlan.listingLimit} active listings`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <Tabs value={tab} onValueChange={(value) => setTab(value as MarketplacePrimaryTab)}>
              <TabsList className="h-auto flex-wrap rounded-xl bg-slate-100 p-1">
                <TabsTrigger value="browse" className="rounded-lg">
                  Browse Parts
                </TabsTrigger>
                <TabsTrigger value="seller-dashboard" className="rounded-lg">
                  Seller Dashboard
                </TabsTrigger>
                <TabsTrigger value="my-listings" className="rounded-lg">
                  My Listings
                </TabsTrigger>
                <TabsTrigger value="seller-plans" className="rounded-lg">
                  Seller Plans
                </TabsTrigger>
                {data.isAdmin && (
                  <TabsTrigger value="moderation" className="rounded-lg">
                    Moderation
                    {moderationDocumentListings.length > 0 && (
                      <Badge variant="outline" className="ml-1.5 border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                        {moderationDocumentListings.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="browse" className="mt-5">
                <MarketplaceBrowse
                  mode={mode}
                  onModeChange={setMode}
                  browsePartListings={browsePartListings}
                  browseDocumentListings={browseDocumentListings}
                  aircraftOptions={data.aircraftOptions}
                  currentAircraftId={data.currentAircraftId ?? null}
                  onPartContactClick={handlePartContactClick}
                  onDocumentInjectSuccess={(listing, result) => {
                    setInjectSuccess({ listing, result })
                    startTransition(() => {
                      setBrowseDocumentListings((current) =>
                        current.map((item) =>
                          item.id === listing.id ? { ...item, hasBeenInjected: true } : item
                        )
                      )
                      setSellerDocumentListings((current) =>
                        current.map((item) =>
                          item.id === listing.id ? { ...item, hasBeenInjected: true } : item
                        )
                      )
                    })
                  }}
                />
              </TabsContent>

              <TabsContent value="seller-dashboard" className="mt-5">
                <MarketplaceSellerCenter
                  view="dashboard"
                  sellerPlan={sellerPlan}
                  listingUsage={listingUsage}
                  sellerRows={sellerRows}
                  onCreatePart={() => {
                        setEditingPartListing(null)
                        setEditingDocumentListing(null)
                        setWizardKind('part')
                      }}
                  onCreateDocument={() => {
                    setEditingDocumentListing(null)
                    setWizardKind('document')
                  }}
                  onPartAction={handlePartListingMutation}
                  onDocumentAction={handleDocumentListingMutation}
                  onEditPart={(listingId) => {
                    const listing = sellerPartListings.find((item) => item.id === listingId) ?? null
                    setEditingPartListing(listing)
                    setEditingDocumentListing(null)
                    setWizardKind('part')
                  }}
                  onEditDocument={(listingId) => {
                    const listing = sellerDocumentListings.find((item) => item.id === listingId) ?? null
                    setEditingDocumentListing(listing)
                    setEditingPartListing(null)
                    setWizardKind('document')
                  }}
                  onPlanChange={handleSellerPlanChange}
                />
              </TabsContent>

              <TabsContent value="my-listings" className="mt-5">
                <MarketplaceSellerCenter
                  view="listings"
                  sellerPlan={sellerPlan}
                  listingUsage={listingUsage}
                  sellerRows={sellerRows}
                  onCreatePart={() => {
                    setEditingPartListing(null)
                    setEditingDocumentListing(null)
                    setWizardKind('part')
                  }}
                  onCreateDocument={() => {
                    setEditingDocumentListing(null)
                    setWizardKind('document')
                  }}
                  onPartAction={handlePartListingMutation}
                  onDocumentAction={handleDocumentListingMutation}
                  onEditPart={(listingId) => {
                    const listing = sellerPartListings.find((item) => item.id === listingId) ?? null
                    setEditingPartListing(listing)
                    setEditingDocumentListing(null)
                    setWizardKind('part')
                  }}
                  onEditDocument={(listingId) => {
                    const listing = sellerDocumentListings.find((item) => item.id === listingId) ?? null
                    setEditingDocumentListing(listing)
                    setEditingPartListing(null)
                    setWizardKind('document')
                  }}
                  onPlanChange={handleSellerPlanChange}
                />
              </TabsContent>

              <TabsContent value="seller-plans" className="mt-5">
                <MarketplaceSellerCenter
                  view="plans"
                  sellerPlan={sellerPlan}
                  listingUsage={listingUsage}
                  sellerRows={sellerRows}
                  onCreatePart={() => {
                    setEditingPartListing(null)
                    setEditingDocumentListing(null)
                    setWizardKind('part')
                  }}
                  onCreateDocument={() => {
                    setEditingDocumentListing(null)
                    setWizardKind('document')
                  }}
                  onPartAction={handlePartListingMutation}
                  onDocumentAction={handleDocumentListingMutation}
                  onEditPart={(listingId) => {
                    const listing = sellerPartListings.find((item) => item.id === listingId) ?? null
                    setEditingPartListing(listing)
                    setEditingDocumentListing(null)
                    setWizardKind('part')
                  }}
                  onEditDocument={(listingId) => {
                    const listing = sellerDocumentListings.find((item) => item.id === listingId) ?? null
                    setEditingDocumentListing(listing)
                    setEditingPartListing(null)
                    setWizardKind('document')
                  }}
                  onPlanChange={handleSellerPlanChange}
                />
              </TabsContent>

              {data.isAdmin && (
                <TabsContent value="moderation" className="mt-5">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Community manual and catalog listings awaiting publication approval.
                    </div>
                    {moderationDocumentListings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
                        <FileCheck2 className="h-10 w-10 text-slate-300" />
                        <h3 className="mt-4 text-lg font-semibold text-slate-900">No pending marketplace reviews</h3>
                        <p className="mt-1 max-w-md text-sm text-slate-600">
                          New manual and catalog submissions will appear here for approval.
                        </p>
                      </div>
                    ) : (
                      moderationDocumentListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{listing.title}</p>
                              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                {listing.accessType === 'paid' ? 'Priced access' : 'Free access'}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-600">
                              {listing.sellerName} · {listing.manufacturer ?? 'Technical source'} · {listing.aircraftApplicability ?? 'General applicability'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleDocumentModeration(listing.id, 'reject')}
                            >
                              Reject
                            </Button>
                            <Button onClick={() => handleDocumentModeration(listing.id, 'approve')}>
                              Approve
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </section>

        {pageError && (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4" />
            {pageError}
          </div>
        )}
      </div>

      <CreateMarketplaceListingDialog
        kind={wizardKind}
        open={wizardKind !== null}
        sellerPlan={sellerPlan}
        listingUsage={listingUsage}
        currentUserName={data.currentUserName}
        currentUserEmail={data.currentUserEmail}
        currentAircraftId={data.currentAircraftId ?? null}
        aircraftOptions={data.aircraftOptions}
        initialPartListing={editingPartListing}
        initialDocumentListing={editingDocumentListing}
        onClose={() => {
          setWizardKind(null)
          setEditingPartListing(null)
          setEditingDocumentListing(null)
        }}
        onPartCreated={(listing) => {
          mergePartListing(listing)
          setTab('my-listings')
          setMode('parts')
          setEditingPartListing(null)
        }}
        onDocumentCreated={(listing) => {
          mergeDocumentListing(listing)
          setTab('my-listings')
          setMode('manuals')
          setEditingDocumentListing(null)
        }}
      />

      {injectSuccess && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-emerald-200 bg-white p-4 shadow-[0_20px_60px_rgba(16,185,129,0.18)]">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">Document injected successfully</p>
              <p className="text-sm text-slate-600">
                {injectSuccess.listing.title} is now stored in your workspace and searchable with AI.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {injectSuccess.result.injectedDocumentId && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`/api/documents/${injectSuccess.result.injectedDocumentId}/preview`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Document
                    </a>
                  </Button>
                )}
                <Button asChild size="sm">
                  <a href="/documents">Go to Aircraft Documents</a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href="/ask">Ask AI</a>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInjectSuccess(null)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
