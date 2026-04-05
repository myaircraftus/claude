'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ShoppingBag, Wrench, BookOpen, FileText, Search, Store,
  ShieldCheck, Upload, Check, X, Download, Users, AlertCircle
} from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { cn, formatDate, formatBytes } from '@/lib/utils'
import type { Document, ManualAccess, DocType } from '@/types'

interface Listing extends Document {
  aircraft: { id: string; tail_number: string; make: string; model: string } | null
}

interface Props {
  browseListings: Listing[]
  sellerListings: Listing[]
  moderationListings: Listing[]
  currentUserId: string
  currentUserName: string
  isAdmin: boolean
  role: string
  defaultTab: string
}

type ManualCategory = 'maintenance' | 'service' | 'parts'

const CATEGORY_META: Record<ManualCategory, { label: string; docType: DocType; icon: any; description: string }> = {
  maintenance: {
    label: 'Maintenance Manual',
    docType: 'maintenance_manual',
    icon: Wrench,
    description: 'Repair, overhaul, and maintenance procedures',
  },
  service: {
    label: 'Service Manual',
    docType: 'service_manual',
    icon: BookOpen,
    description: 'Service bulletins, inspection procedures',
  },
  parts: {
    label: 'Parts Catalog',
    docType: 'parts_catalog',
    icon: FileText,
    description: 'Illustrated parts breakdowns and part numbers',
  },
}

const ROLE_STYLES: Record<string, string> = {
  owner: 'bg-amber-50 text-amber-700 border-amber-200',
  mechanic: 'bg-blue-50 text-blue-700 border-blue-200',
  admin: 'bg-slate-100 text-slate-700 border-slate-200',
}

function RoleBadge({ role }: { role?: string | null }) {
  if (!role) return null
  return (
    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4', ROLE_STYLES[role] ?? 'bg-slate-100')}>
      {role}
    </Badge>
  )
}

function formatPrice(cents?: number | null) {
  if (cents == null) return 'Free'
  return `$${(cents / 100).toFixed(2)}`
}

export function MarketplaceClient({
  browseListings,
  sellerListings,
  moderationListings,
  currentUserId,
  currentUserName,
  isAdmin,
  role,
  defaultTab,
}: Props) {
  const [tab, setTab] = useState(defaultTab)
  const [search, setSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState<ManualCategory | null>(null)
  const canUpload = ['owner', 'admin', 'mechanic'].includes(role)

  const filteredBrowse = useMemo(() => {
    if (!search.trim()) return browseListings
    const q = search.toLowerCase()
    return browseListings.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.description ?? '').toLowerCase().includes(q) ||
        (l.uploader_name ?? '').toLowerCase().includes(q)
    )
  }, [browseListings, search])

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marketplace</h1>
          <p className="text-muted-foreground text-sm">
            Buy, share, and list aircraft manuals with the community.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="browse">
              <ShoppingBag className="h-3.5 w-3.5 mr-1.5" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="seller">
              <Store className="h-3.5 w-3.5 mr-1.5" />
              Seller Dashboard
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="moderation">
                <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                Moderation
                {moderationListings.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
                    {moderationListings.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Upload manuals
            </TabsTrigger>
          </TabsList>

          {/* ─── BROWSE ──────────────────────────────────────────────── */}
          <TabsContent value="browse" className="space-y-4 mt-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search manuals, parts catalogs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {filteredBrowse.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No listings yet"
                description="Published community listings will appear here."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredBrowse.map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── SELLER DASHBOARD ────────────────────────────────────── */}
          <TabsContent value="seller" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Your listings</CardTitle>
                    <CardDescription>
                      {sellerListings.length} community {sellerListings.length === 1 ? 'listing' : 'listings'} · Balance: $0.00 · Last payout: —
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {sellerListings.length === 0 ? (
                  <EmptyState
                    icon={Store}
                    title="No listings yet"
                    description="Upload a manual and set access to Free or Paid to list it here."
                  />
                ) : (
                  <div className="space-y-2">
                    {sellerListings.map((l) => (
                      <SellerRow
                        key={l.id}
                        listing={l}
                        isMine={l.uploaded_by === currentUserId}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── MODERATION ──────────────────────────────────────────── */}
          {isAdmin && (
            <TabsContent value="moderation" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pending review</CardTitle>
                  <CardDescription>
                    Community listings awaiting approval.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {moderationListings.length === 0 ? (
                    <EmptyState
                      icon={ShieldCheck}
                      title="No pending listings"
                      description="New submissions will appear here."
                    />
                  ) : (
                    <div className="space-y-2">
                      {moderationListings.map((l) => (
                        <ModerationRow key={l.id} listing={l} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ─── UPLOAD MANUALS ──────────────────────────────────────── */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            {!canUpload && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                <AlertCircle className="h-4 w-4" />
                You need Mechanic role or higher to upload manuals.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Object.keys(CATEGORY_META) as ManualCategory[]).map((key) => {
                const meta = CATEGORY_META[key]
                const Icon = meta.icon
                return (
                  <Card key={key}>
                    <CardHeader>
                      <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center mb-2">
                        <Icon className="h-5 w-5 text-brand-600" />
                      </div>
                      <CardTitle className="text-base">{meta.label}</CardTitle>
                      <CardDescription>{meta.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!canUpload}
                        onClick={() => setShowUploadModal(key)}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Upload {meta.label.toLowerCase()}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <ManualUploadModal
          category={showUploadModal}
          onClose={() => setShowUploadModal(null)}
          uploaderName={currentUserName}
        />
      )}
    </main>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  )
}

function ListingCard({ listing }: { listing: Listing }) {
  const isPaid = listing.manual_access === 'paid'
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-tight">{listing.title}</CardTitle>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] whitespace-nowrap',
              isPaid ? 'bg-green-50 text-green-700 border-green-200' : 'bg-violet-50 text-violet-700 border-violet-200'
            )}
          >
            {formatPrice(listing.price_cents)}
          </Badge>
        </div>
        {listing.aircraft && (
          <CardDescription className="text-xs">
            {listing.aircraft.make} {listing.aircraft.model}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {listing.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{listing.description}</p>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span>{listing.uploader_name ?? 'Unknown'}</span>
            <RoleBadge role={listing.uploader_role} />
          </div>
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {listing.download_count ?? 0}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function SellerRow({ listing, isMine }: { listing: Listing; isMine: boolean }) {
  const statusStyles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    pending_review: 'bg-amber-50 text-amber-700 border-amber-200',
    published: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  }
  const status = listing.listing_status ?? 'draft'
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/20">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{listing.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>{isMine ? 'You' : listing.uploader_name}</span>
          <RoleBadge role={listing.uploader_role} />
          <span>·</span>
          <span>{formatDate(listing.uploaded_at)}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5">
            <Download className="h-3 w-3" />
            {listing.download_count ?? 0}
          </span>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px]">
        {formatPrice(listing.price_cents)}
      </Badge>
      <Badge variant="outline" className={cn('text-[10px]', statusStyles[status])}>
        {status.replace('_', ' ')}
      </Badge>
    </div>
  )
}

function ModerationRow({ listing }: { listing: Listing }) {
  const [acting, setActing] = useState(false)
  const [handled, setHandled] = useState<'approved' | 'rejected' | null>(null)

  async function decide(approved: boolean) {
    setActing(true)
    const supabase = createBrowserSupabase()
    const { error } = await (supabase as any)
      .from('documents')
      .update({ listing_status: approved ? 'published' : 'rejected' })
      .eq('id', listing.id)
    setActing(false)
    if (!error) setHandled(approved ? 'approved' : 'rejected')
  }

  if (handled) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        {listing.title} — {handled}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{listing.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>{listing.uploader_name}</span>
          <RoleBadge role={listing.uploader_role} />
          <span>·</span>
          <span>{formatPrice(listing.price_cents)}</span>
          <span>·</span>
          <span>{listing.file_size_bytes ? formatBytes(listing.file_size_bytes) : '—'}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => decide(false)} disabled={acting}>
        <X className="h-3 w-3 mr-1" /> Reject
      </Button>
      <Button size="sm" onClick={() => decide(true)} disabled={acting}>
        <Check className="h-3 w-3 mr-1" /> Approve
      </Button>
    </div>
  )
}

// ─── Upload Modal ──────────────────────────────────────────────────────────

function ManualUploadModal({
  category,
  onClose,
  uploaderName,
}: {
  category: ManualCategory
  onClose: () => void
  uploaderName: string
}) {
  const meta = CATEGORY_META[category]
  const [title, setTitle] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [revision, setRevision] = useState('')
  const [description, setDescription] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [accessLevel, setAccessLevel] = useState<ManualAccess>('private')
  const [price, setPrice] = useState('')
  const [launchMode, setLaunchMode] = useState<'publish' | 'draft'>('publish')
  const [attest1, setAttest1] = useState(false)
  const [attest2, setAttest2] = useState(false)
  const [attest3, setAttest3] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const needsAttestation = accessLevel === 'free' || accessLevel === 'paid'
  const canSubmit =
    title.trim() &&
    make.trim() &&
    model.trim() &&
    pdfFile &&
    (!needsAttestation || (attest1 && attest2 && attest3)) &&
    (accessLevel !== 'paid' || (price && Number(price) > 0))

  async function handleSubmit() {
    if (!canSubmit || !pdfFile) return
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', pdfFile)
      fd.append('doc_type', meta.docType)
      fd.append('title', `${title} — ${make} ${model}${revision ? ` (Rev ${revision})` : ''}`)
      fd.append('manual_access', accessLevel)
      if (accessLevel === 'paid') fd.append('price', price)
      fd.append('attestation', String(needsAttestation))
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Upload failed')
      }
      setSuccess(true)
      setTimeout(() => {
        onClose()
        window.location.reload()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent>
          <div className="flex flex-col items-center py-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="font-semibold">Manual submitted!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {launchMode === 'publish'
                ? 'Your listing is pending review.'
                : 'Saved as draft.'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="outline" className="bg-brand-50 text-brand-700 border-brand-200">
              {meta.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Upload a {meta.label.toLowerCase()} for the community marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Listing title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2020 Maintenance Manual" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Make *</Label>
              <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Cessna" />
            </div>
            <div className="space-y-1.5">
              <Label>Model *</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="172" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Revision</Label>
              <Input value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="B" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-1.5">
            <Label>PDF file *</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            />
            {pdfFile && (
              <p className="text-xs text-muted-foreground">
                {pdfFile.name} · {formatBytes(pdfFile.size)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Access Level</Label>
            <div className="flex gap-1 rounded-md border border-border p-0.5 bg-muted/30">
              {(['private', 'free', 'paid'] as ManualAccess[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setAccessLevel(level)}
                  className={cn(
                    'flex-1 px-3 py-1.5 text-xs rounded font-medium transition-colors',
                    accessLevel === level
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {level === 'private' ? 'Private' : level === 'free' ? 'Free download' : 'Paid'}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground p-2 bg-amber-50 border border-amber-200 rounded mt-2">
              Manuals, service manuals, and parts catalogs can stay private or become community
              downloads. Paid listings follow the requested 50% uploader / 50% myaircraft.us split.
            </p>
          </div>

          {accessLevel === 'paid' && (
            <div className="space-y-1.5">
              <Label>Price (USD)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
              {price && Number(price) > 0 && (
                <p className="text-xs text-muted-foreground">
                  You earn ${(Number(price) * 0.5).toFixed(2)} per download (50% of ${Number(price).toFixed(2)})
                </p>
              )}
            </div>
          )}

          {needsAttestation && (
            <>
              <div className="space-y-1.5">
                <Label>Launch</Label>
                <Select value={launchMode} onValueChange={(v) => setLaunchMode(v as 'publish' | 'draft')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publish">Submit for review</SelectItem>
                    <SelectItem value="draft">Save as draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
                <p className="text-xs font-medium">Attestations</p>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={attest1} onChange={(e) => setAttest1(e.target.checked)} className="mt-0.5" />
                  <span>I certify I have the legal right to share this document.</span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={attest2} onChange={(e) => setAttest2(e.target.checked)} className="mt-0.5" />
                  <span>The document does not contain confidential customer or export-controlled data.</span>
                </label>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={attest3} onChange={(e) => setAttest3(e.target.checked)} className="mt-0.5" />
                  <span>I accept the myaircraft.us community library terms.</span>
                </label>
              </div>
            </>
          )}

          {error && (
            <div className="text-xs text-destructive p-2 border border-destructive/30 bg-destructive/5 rounded">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? 'Uploading…' : needsAttestation && launchMode === 'draft' ? 'Save draft' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
