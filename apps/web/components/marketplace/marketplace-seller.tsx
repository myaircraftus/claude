'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Eye,
  FileStack,
  LineChart,
  Package2,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getSellerPlanDefinition } from '@/lib/marketplace/service'
import type {
  ListingUsageSummary,
  MarketplaceDocumentListing,
  MarketplacePartListing,
  MarketplaceSellerRow,
  SellerPlanAccount,
  SellerPlanId,
} from '@/lib/marketplace/types'
import { cn, formatDate } from '@/lib/utils'

interface Props {
  view: 'dashboard' | 'listings' | 'plans'
  sellerPlan: SellerPlanAccount
  listingUsage: ListingUsageSummary
  sellerRows: {
    parts: MarketplacePartListing[]
    documents: MarketplaceDocumentListing[]
  }
  onCreatePart: () => void
  onCreateDocument: () => void
  onEditPart: (listingId: string) => void
  onEditDocument: (listingId: string) => void
  onPartAction: (
    listingId: string,
    action: 'mark_sold' | 'relist' | 'archive' | 'mark_pending' | 'duplicate'
  ) => void
  onDocumentAction: (
    listingId: string,
    action: 'submit_review' | 'archive'
  ) => void
  onPlanChange: (planId: SellerPlanId) => void
}

type ListingFilter =
  | 'all'
  | 'available'
  | 'pending'
  | 'sold'
  | 'draft'
  | 'archived'
  | 'pending_review'
  | 'published'
  | 'rejected'
type ListingTypeFilter = 'all' | 'part' | 'document'

export function MarketplaceSellerCenter({
  view,
  sellerPlan,
  listingUsage,
  sellerRows,
  onCreatePart,
  onCreateDocument,
  onEditPart,
  onEditDocument,
  onPartAction,
  onDocumentAction,
  onPlanChange,
}: Props) {
  const rows = useMemo<MarketplaceSellerRow[]>(() => {
    const partRows = sellerRows.parts.map((listing) => ({
      id: listing.id,
      listingKind: 'part' as const,
      title: listing.title,
      status: listing.status,
      subtitle: `${listing.partNumber} · ${listing.manufacturer}`,
      priceLabel: listing.priceCents > 0 ? `$${(listing.priceCents / 100).toFixed(2)}` : 'Contact seller',
      primaryMetricLabel: 'Views',
      primaryMetricValue: String(listing.views),
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    }))

    const documentRows = sellerRows.documents.map((listing) => ({
      id: listing.id,
      listingKind: 'document' as const,
      title: listing.title,
      status: listing.listingStatus,
      subtitle: `${listing.documentNumber ?? 'No number'} · ${listing.manufacturer ?? 'Technical source'}`,
      priceLabel:
        listing.accessType === 'free'
          ? 'Free'
          : listing.accessType === 'paid'
            ? `$${((listing.priceCents ?? 0) / 100).toFixed(2)}`
            : 'Private',
      primaryMetricLabel: 'Pages',
      primaryMetricValue: listing.pageCount ? String(listing.pageCount) : '—',
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    }))

    return [...partRows, ...documentRows].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }, [sellerRows.documents, sellerRows.parts])

  if (view === 'dashboard') {
    return (
      <DashboardView
        sellerPlan={sellerPlan}
        listingUsage={listingUsage}
        sellerRows={sellerRows}
        rows={rows}
        onCreatePart={onCreatePart}
        onCreateDocument={onCreateDocument}
        onPlanChange={onPlanChange}
      />
    )
  }

  if (view === 'plans') {
    return (
      <PlansView
        sellerPlan={sellerPlan}
        listingUsage={listingUsage}
        onCreatePart={onCreatePart}
        onCreateDocument={onCreateDocument}
        onPlanChange={onPlanChange}
      />
    )
  }

  return (
    <ListingsView
      rows={rows}
      listingUsage={listingUsage}
      onCreatePart={onCreatePart}
      onCreateDocument={onCreateDocument}
      onEditPart={onEditPart}
      onEditDocument={onEditDocument}
      onPartAction={onPartAction}
      onDocumentAction={onDocumentAction}
    />
  )
}

function DashboardView({
  sellerPlan,
  listingUsage,
  sellerRows,
  rows,
  onCreatePart,
  onCreateDocument,
  onPlanChange,
}: {
  sellerPlan: SellerPlanAccount
  listingUsage: ListingUsageSummary
  sellerRows: Props['sellerRows']
  rows: MarketplaceSellerRow[]
  onCreatePart: () => void
  onCreateDocument: () => void
  onPlanChange: (planId: SellerPlanId) => void
}) {
  const plan = getSellerPlanDefinition(sellerPlan.sellerPlan)
  const partViewTotal = sellerRows.parts.reduce((sum, listing) => sum + listing.views, 0)
  const partContactTotal = sellerRows.parts.reduce((sum, listing) => sum + listing.contactMetrics.total, 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_48%,#eef4ff_100%)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="outline" className="w-fit border-brand-200 bg-brand-50 text-brand-700">
                  Seller Dashboard
                </Badge>
                <CardTitle className="text-xl">Current plan: {plan.name}</CardTitle>
                <CardDescription>
                  Physical parts stay subscription-gated while manuals and catalogs remain available for upload, access, and injection.
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => onPlanChange(sellerPlan.sellerPlan === 'starter' ? 'pro' : 'starter')}>
                {sellerPlan.sellerPlan === 'starter' ? 'Upgrade to Pro' : 'Review plan options'}
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            <ListingUsageMeter listingUsage={listingUsage} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Active listings" value={String(listingUsage.activeCount)} icon={Package2} />
              <MetricTile label="Pending" value={String(listingUsage.pendingCount)} icon={LineChart} />
              <MetricTile label="Sold" value={String(listingUsage.soldCount)} icon={Sparkles} />
              <MetricTile label="Contact performance" value={String(partContactTotal)} icon={BarChart3} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Quick actions</CardTitle>
            <CardDescription>
              Launch the right seller flow without leaving Marketplace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <QuickAction
              title="List a physical part"
              description="4-step wizard with AI lookup, pricing, condition, and seller-plan enforcement."
              icon={Wrench}
              onClick={onCreatePart}
            />
            <QuickAction
              title="List a manual / catalog"
              description="Upload PDF, identify metadata, and define download plus inject access."
              icon={BookOpen}
              onClick={onCreateDocument}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Seller plan features</p>
              <ul className="mt-3 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 text-brand-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Performance snapshot</CardTitle>
            <CardDescription>Views, contacts, and publishing mix across the current seller workspace.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricTile label="Total views" value={String(partViewTotal)} icon={Eye} />
            <MetricTile label="Manual uploads" value={String(sellerRows.documents.length)} icon={BookOpen} />
            <MetricTile label="Part listings" value={String(sellerRows.parts.length)} icon={Wrench} />
            <MetricTile
              label="Remaining capacity"
              value={listingUsage.remainingCount == null ? 'Unlimited' : String(listingUsage.remainingCount)}
              icon={FileStack}
            />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Recent listings</CardTitle>
            <CardDescription>The latest marketplace activity for parts and manuals/catalogs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.slice(0, 6).map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-950">{row.title}</p>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">
                      {row.listingKind === 'part' ? 'Part' : 'Manual / Catalog'}
                    </Badge>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="text-sm text-slate-600">{row.subtitle}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>Updated {formatDate(row.updatedAt)}</p>
                  <p>{row.priceLabel ?? '—'}</p>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
                No marketplace listings yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ListingsView({
  rows,
  listingUsage,
  onCreatePart,
  onCreateDocument,
  onEditPart,
  onEditDocument,
  onPartAction,
  onDocumentAction,
}: {
  rows: MarketplaceSellerRow[]
  listingUsage: ListingUsageSummary
  onCreatePart: () => void
  onCreateDocument: () => void
  onEditPart: (listingId: string) => void
  onEditDocument: (listingId: string) => void
  onPartAction: Props['onPartAction']
  onDocumentAction: Props['onDocumentAction']
}) {
  const [statusFilter, setStatusFilter] = useState<ListingFilter>('all')
  const [typeFilter, setTypeFilter] = useState<ListingTypeFilter>('all')
  const [query, setQuery] = useState('')

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (typeFilter !== 'all' && row.listingKind !== typeFilter) return false
      if (!query.trim()) return true
      const haystack = [row.title, row.subtitle, row.priceLabel, row.primaryMetricLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query.trim().toLowerCase())
    })
  }, [query, rows, statusFilter, typeFilter])

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">My Listings</CardTitle>
              <CardDescription>
                Search, filter, and manage both parts and manuals / catalogs from one table.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onCreatePart}>
                <Wrench className="h-4 w-4" />
                List a part
              </Button>
              <Button onClick={onCreateDocument}>
                <BookOpen className="h-4 w-4" />
                List a manual
              </Button>
            </div>
          </div>
          <ListingUsageMeter listingUsage={listingUsage} compact />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, number, manufacturer, or status"
              className="h-11 max-w-md rounded-xl border-slate-200"
            />
            <div className="flex flex-wrap gap-2">
              {(['all', 'available', 'pending', 'sold', 'draft', 'archived', 'pending_review', 'published', 'rejected'] as ListingFilter[]).map((value) => (
                <Chip
                  key={value}
                  active={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {value === 'all' ? 'All' : value.replace(/_/g, ' ')}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', 'part', 'document'] as ListingTypeFilter[]).map((value) => (
                <Chip
                  key={value}
                  active={typeFilter === value}
                  onClick={() => setTypeFilter(value)}
                >
                  {value === 'all' ? 'All Listings' : value === 'part' ? 'Parts' : 'Manuals & Catalogs'}
                </Chip>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[1.4fr_0.9fr_0.6fr_0.6fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              <span>Listing</span>
              <span>Type</span>
              <span>Status</span>
              <span>Metric</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-200">
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[1.4fr_0.9fr_0.6fr_0.6fr_0.9fr] lg:items-center"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-slate-950">{row.title}</p>
                    <p className="text-sm text-slate-600">{row.subtitle}</p>
                    <p className="text-xs text-slate-400">
                      Updated {formatDate(row.updatedAt)}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    {row.listingKind === 'part' ? 'Physical Part' : 'Manual / Catalog'}
                  </div>
                  <div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="text-sm text-slate-600">
                    {row.primaryMetricValue ?? '—'} {row.primaryMetricLabel ?? ''}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    {row.listingKind === 'part' ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onEditPart(row.id)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onPartAction(row.id, 'duplicate')}>
                          Duplicate
                        </Button>
                        {row.status !== 'sold' && (
                          <Button size="sm" variant="outline" onClick={() => onPartAction(row.id, 'mark_sold')}>
                            Mark sold
                          </Button>
                        )}
                        {row.status !== 'pending' && row.status !== 'sold' && row.status !== 'archived' && (
                          <Button size="sm" variant="outline" onClick={() => onPartAction(row.id, 'mark_pending')}>
                            Pending
                          </Button>
                        )}
                        {row.status !== 'available' && row.status !== 'archived' && (
                          <Button size="sm" variant="outline" onClick={() => onPartAction(row.id, 'relist')}>
                            Relist
                          </Button>
                        )}
                        {row.status !== 'archived' && (
                          <Button size="sm" variant="ghost" onClick={() => onPartAction(row.id, 'archive')}>
                            Archive
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onEditDocument(row.id)}>
                          Edit
                        </Button>
                        {row.status !== 'published' && row.status !== 'pending_review' && (
                          <Button size="sm" variant="outline" onClick={() => onDocumentAction(row.id, 'submit_review')}>
                            {row.status === 'rejected' ? 'Relist' : 'Submit'}
                          </Button>
                        )}
                        {(row.status === 'published' || row.status === 'pending_review') && (
                          <Button size="sm" variant="ghost" onClick={() => onDocumentAction(row.id, 'archive')}>
                            Archive
                          </Button>
                        )}
                        <Button asChild size="sm" variant="outline">
                          <a href="/documents">Open in Documents</a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {filteredRows.length === 0 && (
                <div className="px-6 py-16 text-center text-sm text-slate-500">
                  No listings match the current filters.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PlansView({
  sellerPlan,
  listingUsage,
  onCreatePart,
  onCreateDocument,
  onPlanChange,
}: {
  sellerPlan: SellerPlanAccount
  listingUsage: ListingUsageSummary
  onCreatePart: () => void
  onCreateDocument: () => void
  onPlanChange: (planId: SellerPlanId) => void
}) {
  const plans = [getSellerPlanDefinition('starter'), getSellerPlanDefinition('pro')]

  return (
    <div className="space-y-4">
      <ListingUsageMeter listingUsage={listingUsage} />
      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = sellerPlan.sellerPlan === plan.id
          return (
            <Card
              key={plan.id}
              className={cn(
                'border-slate-200 shadow-sm',
                isCurrent && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white'
              )}
            >
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>
                      {plan.listingLimit == null
                        ? 'Unlimited active listings'
                        : `Up to ${plan.listingLimit} active listings`}
                    </CardDescription>
                  </div>
                  {isCurrent && <Badge>Current</Badge>}
                </div>
                <div>
                  <p className="text-3xl font-semibold text-slate-950">
                    ${plan.monthlyPrice.toFixed(plan.monthlyPrice % 1 === 0 ? 0 : 2)}
                    <span className="text-sm font-normal text-slate-500"> / month</span>
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 text-brand-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant={isCurrent ? 'outline' : 'default'} onClick={() => onPlanChange(plan.id)}>
                    {isCurrent ? 'Current plan' : `Switch to ${plan.name}`}
                  </Button>
                  <Button variant="ghost" onClick={plan.id === 'starter' ? onCreatePart : onCreateDocument}>
                    {plan.id === 'starter' ? 'List a part' : 'List a manual'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function ListingUsageMeter({
  listingUsage,
  compact = false,
}: {
  listingUsage: ListingUsageSummary
  compact?: boolean
}) {
  const width =
    listingUsage.listingLimit == null
      ? 100
      : Math.min(100, Math.round((listingUsage.activeCount / Math.max(listingUsage.listingLimit, 1)) * 100))

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white', compact ? 'p-4' : 'p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Listing usage</p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {listingUsage.activeCount}
            {listingUsage.listingLimit == null ? ' active listings' : ` / ${listingUsage.listingLimit} active listings`}
          </p>
        </div>
        <div className="text-right text-sm text-slate-600">
          {listingUsage.remainingCount == null
            ? 'Unlimited remaining'
            : `${listingUsage.remainingCount} remaining before upgrade`}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <div className="rounded-xl bg-white p-2 text-brand-700 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  )
}

function QuickAction({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-2 text-brand-700">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="font-medium text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  )
}

function Chip({
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.replace('_', ' ')
  const tone =
    status === 'available' || status === 'published'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'pending' || status === 'pending_review'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'sold'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : status === 'rejected'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <Badge variant="outline" className={tone}>
      {normalized}
    </Badge>
  )
}
