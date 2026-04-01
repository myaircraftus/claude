'use client'

import { useState } from 'react'
import {
  BookOpen, Search, Upload, Download, DollarSign,
  FileText, Settings, Star, Users, Plane, X, Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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
}

type FilterTab = 'all' | 'maintenance_manual' | 'parts_catalog' | 'free' | 'paid'

const AIRCRAFT_MAKES = ['All Makes', 'Cessna', 'Piper', 'Beechcraft', 'Cirrus', 'Diamond', 'Mooney', 'Grumman', 'Schweizer', 'Robinson', 'Bell']

export default function LibraryClient({ items, orgId }: LibraryClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [makeFilter, setMakeFilter] = useState('All Makes')
  const [search, setSearch] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [ingestedIds, setIngestedIds] = useState<Set<string>>(new Set())

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

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `All (${items.length})` },
    { id: 'maintenance_manual', label: 'Maintenance Manuals' },
    { id: 'parts_catalog', label: 'Parts Catalogs' },
    { id: 'free', label: 'Free' },
    { id: 'paid', label: 'Paid' },
  ]

  async function handleIngest(item: LibraryItem) {
    setIngestingId(item.id)
    try {
      await new Promise(r => setTimeout(r, 1200)) // simulate
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
          <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Manual
          </Button>
        </div>

        {/* Revenue share banner */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm">
          <DollarSign className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          <span><strong>Earn from your uploads:</strong> Set a price and keep 50% of every sale. Free uploads help the community and build reputation.</span>
        </div>

        {/* Search + filters */}
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {tabs.map(tab => (
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
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} orgId={orgId} />
      )}
    </main>
  )
}

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
