'use client'

import { useState } from 'react'
import {
  BookOpen, Search, Upload, Download, DollarSign,
  FileText, Settings, Star, Users, Plane, X, Loader2,
  Wrench, BookMarked, CheckCircle2, Lock, Unlock,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: string
  title: string
  document_type: string
  aircraft_make?: string
  aircraft_model?: string
  aircraft_series?: string
  engine_make?: string
  revision?: string
  is_paid: boolean
  price_cents?: number
  download_count: number
  status: string
  uploaded_by_org_id: string
}

interface LibraryClientProps {
  items: LibraryItem[]
  orgId: string
  userId?: string
  userName?: string
  userRole?: string
  initialTab?: PageTab
}

type PageTab = 'browse' | 'seller' | 'upload'
type FilterTab = 'all' | 'maintenance_manual' | 'parts_catalog' | 'free' | 'paid'
type ManualKind = 'maintenance' | 'service' | 'parts'

interface ManualUploadForm {
  docType: 'Maintenance manual' | 'Service manual' | 'Parts catalog'
  title: string
  make: string
  model: string
  revision: string
  description: string
  pdfFile: string
  accessLevel: 'private' | 'free' | 'paid'
  price: string
  launchMode: 'publish' | 'draft'
  attest1: boolean
  attest2: boolean
  attest3: boolean
}

const AIRCRAFT_MAKES = ['All Makes', 'Cessna', 'Piper', 'Beechcraft', 'Cirrus', 'Diamond', 'Mooney', 'Grumman', 'Schweizer', 'Robinson', 'Bell']

function docTypeLabel(kind: ManualKind): ManualUploadForm['docType'] {
  if (kind === 'maintenance') return 'Maintenance manual'
  if (kind === 'service') return 'Service manual'
  return 'Parts catalog'
}

function emptyForm(kind: ManualKind): ManualUploadForm {
  return {
    docType: docTypeLabel(kind),
    title: '',
    make: '',
    model: '',
    revision: '',
    description: '',
    pdfFile: '',
    accessLevel: 'private',
    price: '',
    launchMode: 'publish',
    attest1: false,
    attest2: false,
    attest3: false,
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LibraryClient({ items, orgId, userId, userName, userRole, initialTab = 'browse' }: LibraryClientProps) {
  // ── Page-level tab ───────────────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<PageTab>(initialTab)

  // ── Browse state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [makeFilter, setMakeFilter] = useState('All Makes')
  const [search, setSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [ingestedIds, setIngestedIds] = useState<Set<string>>(new Set())

  // ── Upload Manuals tab state ──────────────────────────────────────────────
  const [showUploadManual, setShowUploadManual] = useState<ManualKind | null>(null)
  const [manualUploadSuccess, setManualUploadSuccess] = useState(false)

  const filtered = items.filter(item => {
    if (activeTab === 'maintenance_manual' && item.document_type !== 'maintenance_manual') return false
    if (activeTab === 'parts_catalog' && item.document_type !== 'parts_catalog') return false
    if (activeTab === 'free' && item.is_paid) return false
    if (activeTab === 'paid' && !item.is_paid) return false
    if (makeFilter !== 'All Makes' && item.aircraft_make?.toUpperCase() !== makeFilter.toUpperCase()) return false
    if (search && !item.title.toLowerCase().includes(search.toLowerCase()) &&
        !item.aircraft_make?.toLowerCase().includes(search.toLowerCase()) &&
        !item.aircraft_model?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'maintenance_manual', label: 'Maintenance Manuals' },
    { id: 'parts_catalog', label: 'Parts Catalogs' },
    { id: 'free', label: 'Free' },
    { id: 'paid', label: 'Paid' },
  ]

  async function handleIngest(item: LibraryItem) {
    setIngestingId(item.id)
    try {
      await new Promise(r => setTimeout(r, 1200))
      setIngestedIds(prev => new Set(Array.from(prev).concat([item.id])))
    } finally {
      setIngestingId(null)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Community Library</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Shared maintenance manuals and parts catalogs from the community
                </p>
              </div>
            </div>
          </div>
          {pageTab === 'browse' && (
            <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Manual
            </Button>
          )}
        </div>

        {/* Revenue share banner */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm">
          <DollarSign className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span><strong>Earn from your uploads:</strong> Set a price and keep 50% of every sale. Free uploads help the community and build reputation.</span>
        </div>

        {/* Page-level tab bar */}
        <div className="flex gap-1 border-b border-border">
          {([
            { id: 'browse' as PageTab, label: 'Browse' },
            { id: 'seller' as PageTab, label: 'Seller Dashboard' },
            { id: 'upload' as PageTab, label: 'Upload Manuals' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setPageTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                pageTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Browse tab ───────────────────────────────────────────────────── */}
        {pageTab === 'browse' && (
          <>
            {/* Search + make filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search manuals, aircraft make, model..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <select
                value={makeFilter}
                onChange={e => setMakeFilter(e.target.value)}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {AIRCRAFT_MAKES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 border-b border-border">
              {filterTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="text-center py-20">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                  <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {items.length === 0 ? 'No manuals in the library yet' : 'No results found'}
                </h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
                  {items.length === 0
                    ? 'Be the first to share a maintenance manual or parts catalog with the community.'
                    : 'Try adjusting your search or filters.'}
                </p>
                <Button onClick={() => setShowUploadModal(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Manual
                </Button>
              </div>
            )}

            {/* Grid */}
            {filtered.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(item => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            'p-1.5 rounded',
                            item.document_type === 'maintenance_manual' ? 'bg-blue-50' : 'bg-purple-50'
                          )}>
                            {item.document_type === 'maintenance_manual'
                              ? <Settings className="h-4 w-4 text-blue-600" />
                              : <FileText className="h-4 w-4 text-purple-600" />
                            }
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {item.document_type === 'maintenance_manual' ? 'Maintenance Manual' : 'Parts Catalog'}
                          </Badge>
                        </div>
                        {item.is_paid ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-semibold">
                            ${((item.price_cents ?? 0) / 100).toFixed(0)}
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-semibold">
                            Free
                          </Badge>
                        )}
                      </div>

                      <h3 className="font-semibold text-foreground text-sm leading-tight mb-2 line-clamp-2">
                        {item.title}
                      </h3>

                      {(item.aircraft_make || item.aircraft_model) && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {[item.aircraft_make, item.aircraft_model, item.aircraft_series].filter(Boolean).join(' ')}
                          </span>
                        </div>
                      )}

                      {item.revision && (
                        <p className="text-xs text-muted-foreground mb-3">Rev: {item.revision}</p>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Download className="h-3.5 w-3.5" />
                          <span>{item.download_count} downloads</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          <span>Community</span>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-3"
                        size="sm"
                        variant={ingestedIds.has(item.id) ? 'secondary' : 'default'}
                        disabled={ingestingId === item.id || ingestedIds.has(item.id)}
                        onClick={() => handleIngest(item)}
                      >
                        {ingestingId === item.id ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Ingesting…</>
                        ) : ingestedIds.has(item.id) ? (
                          <>✓ Added to My Aircraft</>
                        ) : item.is_paid ? (
                          <><DollarSign className="h-3.5 w-3.5 mr-1.5" />Purchase & Ingest</>
                        ) : (
                          <><Download className="h-3.5 w-3.5 mr-1.5" />Ingest to My Aircraft</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Seller Dashboard tab ─────────────────────────────────────────── */}
        {pageTab === 'seller' && (
          <SellerDashboard
            items={items}
            userId={userId}
            userName={userName}
            userRole={userRole}
          />
        )}

        {/* ── Upload Manuals tab ───────────────────────────────────────────── */}
        {pageTab === 'upload' && (
          <UploadManualsTab
            onOpen={setShowUploadManual}
            success={manualUploadSuccess}
          />
        )}
      </div>

      {/* Existing Upload Modal (browse tab) */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} orgId={orgId} />
      )}

      {/* Manual Upload Modal (upload tab) */}
      {showUploadManual && (
        <ManualUploadModal
          kind={showUploadManual}
          userId={userId}
          onSuccess={() => {
            setManualUploadSuccess(true)
            setTimeout(() => {
              setManualUploadSuccess(false)
              setShowUploadManual(null)
            }, 2500)
          }}
          onClose={() => setShowUploadManual(null)}
        />
      )}
    </main>
  )
}

// ─── Seller Dashboard ─────────────────────────────────────────────────────────

function RoleBadge({ role }: { role?: string }) {
  if (role === 'owner') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Owner</span>
  if (role === 'mechanic') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Mechanic</span>
  if (role === 'admin') return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Admin</span>
  return null
}

function SellerDashboard({
  items,
  userId,
  userName,
  userRole,
}: {
  items: LibraryItem[]
  userId?: string
  userName?: string
  userRole?: string
}) {
  // In the demo, show all org items as seller listings
  const myItems = items.filter(item => item.uploaded_by_org_id != null)

  return (
    <div className="space-y-6">
      {/* Payout summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Balance</p>
          <p className="text-2xl font-bold text-foreground">$0.00</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Last payout</p>
          <p className="text-lg font-semibold text-muted-foreground">—</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">Total earned</p>
          <p className="text-2xl font-bold text-foreground">$0.00</p>
        </div>
      </div>

      {/* Listings table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {myItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <DollarSign className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No community listings yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload a manual and set it to Free or Paid to start earning.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Seller</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Downloads</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Pricing</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {myItems.map(item => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-foreground text-xs truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.document_type === 'maintenance_manual' ? 'Maintenance Manual' : 'Parts Catalog'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-foreground">
                          {item.uploaded_by_org_id === item.uploaded_by_org_id && userId
                            ? (userName ?? 'You')
                            : 'Community'}
                        </span>
                        <RoleBadge role={userRole} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {item.download_count}
                    </td>
                    <td className="px-4 py-3">
                      {item.is_paid ? (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                          ${((item.price_cents ?? 0) / 100).toFixed(0)}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">Free</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      Balance: $0.00 · Last payout: —
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Upload Manuals tab: 3 cards ──────────────────────────────────────────────

const MANUAL_CARDS: {
  kind: ManualKind
  label: string
  description: string
  icon: React.ReactNode
  color: string
}[] = [
  {
    kind: 'maintenance',
    label: 'Maintenance Manual',
    description: 'AMM, Maintenance Manual, or Structural Repair Manual for an airframe or engine.',
    icon: <Wrench className="h-6 w-6 text-blue-600" />,
    color: 'bg-blue-50',
  },
  {
    kind: 'service',
    label: 'Service Manual',
    description: 'Service Manual or Overhaul Manual for an engine, prop, or avionics component.',
    icon: <Settings className="h-6 w-6 text-amber-600" />,
    color: 'bg-amber-50',
  },
  {
    kind: 'parts',
    label: 'Parts Catalog',
    description: 'Illustrated Parts Catalog (IPC) or Parts Manual for any aircraft or component.',
    icon: <BookMarked className="h-6 w-6 text-violet-600" />,
    color: 'bg-violet-50',
  },
]

function UploadManualsTab({
  onOpen,
  success,
}: {
  onOpen: (kind: ManualKind) => void
  success: boolean
}) {
  return (
    <div className="space-y-6">
      {success && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm font-medium">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          Submission received — your manual will be reviewed and listed in the community library.
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Upload a Manual</h2>
        <p className="text-sm text-muted-foreground">
          Choose the type of manual you want to contribute. You can keep it private, offer it free, or set a price and earn 50% of every sale.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {MANUAL_CARDS.map(card => (
          <Card key={card.kind} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex flex-col items-start gap-4">
              <div className={cn('p-3 rounded-xl', card.color)}>
                {card.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-sm mb-1">{card.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
              <Button
                className="w-full"
                size="sm"
                onClick={() => onOpen(card.kind)}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload {card.label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Manual Upload Modal ──────────────────────────────────────────────────────

function ManualUploadModal({
  kind,
  userId,
  onSuccess,
  onClose,
}: {
  kind: ManualKind
  userId?: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<ManualUploadForm>(emptyForm(kind))
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    form.title.trim() !== '' &&
    form.make.trim() !== '' &&
    form.model.trim() !== '' &&
    form.pdfFile !== '' &&
    (form.accessLevel === 'private' || (form.attest1 && form.attest2 && form.attest3))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    // TODO backend: POST /api/marketplace/listings — PDF to S3, create DB record
    // Status: accessLevel=private → 'private'; free/paid + launchMode=publish → 'pending review'; draft → 'draft'
    await new Promise(r => setTimeout(r, 1000))
    setSubmitting(false)
    onSuccess()
  }

  const isPaid = form.accessLevel === 'paid'
  const isFreeOrPaid = form.accessLevel !== 'private'
  const uploaderShare = isPaid && form.price
    ? (parseFloat(form.price) * 0.5).toFixed(2)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Upload {form.docType}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 1. docType badge (locked) */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Document Type</Label>
            <Badge variant="secondary" className="text-sm px-3 py-1">{form.docType}</Badge>
          </div>

          {/* 2. Listing Title */}
          <div>
            <Label htmlFor="mu-title">Listing Title *</Label>
            <Input
              id="mu-title"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Cessna 172 Maintenance Manual Rev 3"
              className="mt-1"
              required
            />
          </div>

          {/* 3. Make / Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mu-make">Make *</Label>
              <Input
                id="mu-make"
                value={form.make}
                onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
                placeholder="Cessna"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="mu-model">Model *</Label>
              <Input
                id="mu-model"
                value={form.model}
                onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="172"
                className="mt-1"
                required
              />
            </div>
          </div>

          {/* 4. Revision / Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="mu-revision">Revision</Label>
              <Input
                id="mu-revision"
                value={form.revision}
                onChange={e => setForm(f => ({ ...f, revision: e.target.value }))}
                placeholder="Rev 3, 2019..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="mu-description">Description</Label>
              <Input
                id="mu-description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes"
                className="mt-1"
              />
            </div>
          </div>

          {/* 5. PDF upload */}
          <div>
            <Label>PDF File *</Label>
            <label className="mt-1 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer">
              <Upload className="h-6 w-6 text-muted-foreground mb-2" />
              {form.pdfFile ? (
                <span className="text-sm font-medium text-foreground">{form.pdfFile}</span>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Drop PDF here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF up to 500 MB</p>
                </>
              )}
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) setForm(f => ({ ...f, pdfFile: file.name }))
                }}
              />
            </label>
          </div>

          {/* 6. Access Level toggle */}
          <div>
            <Label>Access Level</Label>
            <div className="flex mt-1 rounded-md overflow-hidden border border-input">
              {(['private', 'free', 'paid'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, accessLevel: level }))}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors capitalize',
                    form.accessLevel === level
                      ? 'bg-blue-600 text-white'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  )}
                >
                  {level === 'private' ? 'Private' : level === 'free' ? 'Free Download' : 'Paid'}
                </button>
              ))}
            </div>
          </div>

          {/* 7. Disclosure (always shown) */}
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
            Manuals, service manuals, and parts catalogs can stay private or become community downloads. Paid listings follow the requested 50% uploader / 50% myaircraft.us split.
          </div>

          {/* 8. Price input (paid only) */}
          {isPaid && (
            <div>
              <Label htmlFor="mu-price">Price (USD) *</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  id="mu-price"
                  type="number"
                  min="1"
                  max="500"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="29"
                  className="pl-6"
                />
              </div>
            </div>
          )}

          {/* 9. Revenue preview (paid only) */}
          {isPaid && uploaderShare && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
              <span className="font-semibold">Your share per sale: ${uploaderShare}</span>
              {' '}— myaircraft.us retains ${(parseFloat(form.price) * 0.5).toFixed(2)}.
            </div>
          )}

          {/* 10. Launch mode toggle (free/paid only) */}
          {isFreeOrPaid && (
            <div>
              <Label>Launch Mode</Label>
              <div className="flex mt-1 rounded-md overflow-hidden border border-input">
                {(['publish', 'draft'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, launchMode: mode }))}
                    className={cn(
                      'flex-1 py-2 text-xs font-medium transition-colors capitalize',
                      form.launchMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {mode === 'publish' ? 'Publish Now' : 'Save as Draft'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 11. Attestations (free/paid only) */}
          {isFreeOrPaid && (
            <div className="space-y-2.5">
              <Label>Attestations</Label>
              {[
                { key: 'attest1' as const, text: 'I have the right to distribute this document and it is not subject to export control restrictions.' },
                { key: 'attest2' as const, text: 'This document does not infringe any copyright, trademark, or intellectual property rights.' },
                { key: 'attest3' as const, text: 'I understand that false attestations may result in removal of the listing and account suspension.' },
              ].map(({ key, text }) => (
                <label key={key} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="mt-0.5 rounded border-input"
                  />
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-relaxed">
                    {text}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!canSubmit || submitting} className="flex-1">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : 'Submit'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Existing UploadModal (unchanged) ────────────────────────────────────────

function UploadModal({ onClose, orgId }: { onClose: () => void; orgId: string }) {
  const [form, setForm] = useState({
    document_type: 'maintenance_manual',
    title: '',
    aircraft_make: '',
    aircraft_model: '',
    aircraft_series: '',
    engine_make: '',
    revision: '',
    is_public: true,
    is_paid: false,
    price: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 1000))
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Upload to Community Library</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Star className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Upload Submitted!</h3>
            <p className="text-muted-foreground text-sm mb-4">Your manual will be reviewed and made available in the community library.</p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <Label>Document Type</Label>
              <select
                value={form.document_type}
                onChange={e => setForm(f => ({ ...f, document_type: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              >
                <option value="maintenance_manual">Maintenance Manual</option>
                <option value="parts_catalog">Parts Catalog / IPC</option>
              </select>
            </div>

            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Cessna 172 Maintenance Manual"
                className="mt-1"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aircraft Make</Label>
                <Input value={form.aircraft_make} onChange={e => setForm(f => ({ ...f, aircraft_make: e.target.value }))} placeholder="Cessna" className="mt-1" />
              </div>
              <div>
                <Label>Aircraft Model</Label>
                <Input value={form.aircraft_model} onChange={e => setForm(f => ({ ...f, aircraft_model: e.target.value }))} placeholder="172" className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Series (optional)</Label>
                <Input value={form.aircraft_series} onChange={e => setForm(f => ({ ...f, aircraft_series: e.target.value }))} placeholder="S, SP, R..." className="mt-1" />
              </div>
              <div>
                <Label>Revision (optional)</Label>
                <Input value={form.revision} onChange={e => setForm(f => ({ ...f, revision: e.target.value }))} placeholder="Rev 3, 2019..." className="mt-1" />
              </div>
            </div>

            <div>
              <Label>File</Label>
              <div className="mt-1 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-blue-400 transition-colors cursor-pointer">
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Drop PDF here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">PDF up to 500 MB</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Visibility</Label>
                <select
                  value={form.is_public ? 'public' : 'private'}
                  onChange={e => setForm(f => ({ ...f, is_public: e.target.value === 'public' }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="public">Public (discoverable)</option>
                  <option value="private">Private (only me)</option>
                </select>
              </div>
              <div>
                <Label>Pricing</Label>
                <select
                  value={form.is_paid ? 'paid' : 'free'}
                  onChange={e => setForm(f => ({ ...f, is_paid: e.target.value === 'paid' }))}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {form.is_paid && (
              <div>
                <Label>Price (USD)</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="29"
                    className="pl-6"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">You keep 50% of each sale. myaircraft.us retains 50%.</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : 'Upload to Library'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
