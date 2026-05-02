'use client'

/**
 * Manuals view — categorized reference library.
 *
 * Layout:
 *   - Top: Upload Manual button, category tabs, search
 *   - Body: groups by manual type, each card shows the aircraft it applies to
 *
 * No Ask box on this page — Ask Aircraft lives inside the aircraft detail
 * view. This page is purely a library: upload, browse, click into the PDF.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen, Upload, FileText, Search, Loader2, CheckCircle2,
  AlertTriangle, Wrench, ShieldCheck, Package, X, Plus, Plane, ChevronDown,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Document, DocType } from '@/types'

interface AircraftOption {
  id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
}

const CATEGORIES: Array<{ id: DocType | 'all'; label: string; icon: any; description: string }> = [
  { id: 'all',                     label: 'All',                  icon: BookOpen,    description: 'Every manual on file' },
  { id: 'parts_catalog',           label: 'Parts Catalog',        icon: Package,     description: 'IPCs, exploded views' },
  { id: 'maintenance_manual',      label: 'Maintenance Manual',   icon: Wrench,      description: 'AMM / shop manuals' },
  { id: 'service_manual',          label: 'Service Manual',       icon: Wrench,      description: 'Engine / accessory SMs' },
  { id: 'service_bulletin',        label: 'Service Bulletins',    icon: AlertTriangle, description: 'Manufacturer SBs' },
  { id: 'airworthiness_directive', label: 'AD Reference',         icon: ShieldCheck, description: 'AD library' },
  { id: 'miscellaneous',           label: 'Other',                icon: FileText,    description: 'Misc reference' },
]

type ManualDoc = Document & {
  aircraft?: { id: string; tail_number: string; make: string | null; model: string | null; year: number | null } | null
  file_size_bytes?: number
}

interface ManualsViewProps {
  manuals: Document[]
  aircraft: AircraftOption[]
}

export function ManualsView({ manuals: initialManuals, aircraft }: ManualsViewProps) {
  const [manuals, setManuals] = useState<ManualDoc[]>(initialManuals as ManualDoc[])
  const [activeCategory, setActiveCategory] = useState<DocType | 'all'>('all')
  const [searchQ, setSearchQ] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    return manuals.filter((m) => {
      if (activeCategory !== 'all' && m.doc_type !== activeCategory) return false
      if (!q) return true
      const tail = m.aircraft?.tail_number ?? ''
      const makeModel = `${m.aircraft?.make ?? ''} ${m.aircraft?.model ?? ''}`
      return (
        m.title.toLowerCase().includes(q) ||
        tail.toLowerCase().includes(q) ||
        makeModel.toLowerCase().includes(q)
      )
    })
  }, [manuals, activeCategory, searchQ])

  const counts = useMemo(() => {
    const map: Partial<Record<DocType | 'all', number>> = { all: manuals.length }
    for (const m of manuals) map[m.doc_type] = (map[m.doc_type] ?? 0) + 1
    return map
  }, [manuals])

  // ─── Group by manual type so each category section is a self-contained
  // shelf — easier to scan than a flat grid when you have hundreds of
  // manuals across multiple aircraft types.
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, ManualDoc[]> = {}
    for (const m of filtered) {
      const key = m.doc_type
      if (!groups[key]) groups[key] = []
      groups[key].push(m)
    }
    // Order matches the CATEGORIES tab order so groups always appear in the
    // same sequence regardless of upload order.
    const order = CATEGORIES.filter((c) => c.id !== 'all').map((c) => c.id)
    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({
        category: CATEGORIES.find((c) => c.id === k)!,
        items: groups[k],
      }))
  }, [filtered])

  const handleManualUploaded = useCallback(async () => {
    // Refresh list after upload completes
    try {
      // Use ?persona=mechanic — /api/documents recognises this and filters to
      // the mechanic-reference doc-type set, which closely matches the
      // MANUAL_DOC_TYPES list this page filters by server-side. The previous
      // ?manuals=true was silently ignored and returned ALL org docs.
      const res = await fetch('/api/documents?persona=mechanic&limit=300')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data?.documents)) setManuals(data.documents as ManualDoc[])
      }
    } catch {
      /* swallow — best-effort refresh */
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              Manuals
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Parts catalogs, maintenance manuals, and reference docs — uploaded by your shop
            </p>
          </div>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Upload Manual
        </Button>
      </div>

      {/* Category tabs + search */}
      <div className="px-6 py-3 border-b border-border bg-white shrink-0 space-y-3">
        <div className="flex items-center gap-1 overflow-x-auto">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const active = activeCategory === cat.id
            const n = counts[cat.id] ?? 0
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors shrink-0',
                  active
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
                style={{ fontWeight: 600 }}
              >
                <Icon className="h-3.5 w-3.5" />
                {cat.label}
                {n > 0 && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full',
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                    )}
                    style={{ fontWeight: 700 }}
                  >
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2 max-w-xl">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search by manual title, tail number, or aircraft model..."
            className="bg-transparent text-sm outline-none flex-1 placeholder:text-muted-foreground/50"
          />
          {searchQ && (
            <button onClick={() => setSearchQ('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body — grouped by category */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {searchQ || activeCategory !== 'all'
                ? 'No manuals match these filters'
                : 'No manuals uploaded yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {searchQ || activeCategory !== 'all'
                ? 'Try a different category or clear the search.'
                : 'Click "Upload Manual" to add your first parts catalog or AMM. Each manual gets ingested so you can ask questions inside the aircraft view.'}
            </p>
          </div>
        ) : (
          groupedByCategory.map(({ category, items }) => {
            const Icon = category.icon
            return (
              <section key={category.id} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                    {category.label}
                  </h2>
                  <span className="text-[11px] text-muted-foreground">
                    {items.length} manual{items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((m) => {
                    const status = m.parsing_status
                    const aircraftLabel = m.aircraft
                      ? `${m.aircraft.tail_number}${m.aircraft.make || m.aircraft.model ? ' · ' + [m.aircraft.make, m.aircraft.model].filter(Boolean).join(' ') : ''}`
                      : 'Unassigned'
                    return (
                      <a
                        key={m.id}
                        href={`/documents/${m.id}`}
                        className="bg-white border border-border rounded-xl p-3 hover:shadow-md hover:border-primary/30 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] text-foreground line-clamp-2" style={{ fontWeight: 600 }}>
                              {m.title}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5 truncate">
                              <Plane className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{aircraftLabel}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border">
                          <span className="text-[10px] text-muted-foreground">
                            {m.page_count ? `${m.page_count} pages` : ''}
                            {m.file_size_bytes ? ` · ${formatBytes(m.file_size_bytes)}` : ''}
                          </span>
                          {status === 'completed' ? (
                            <span className="flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                              <CheckCircle2 className="h-2.5 w-2.5" /> Ready
                            </span>
                          ) : status === 'failed' ? (
                            <span className="flex items-center gap-1 text-[9px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                              <AlertTriangle className="h-2.5 w-2.5" /> Failed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                              <Loader2 className="h-2.5 w-2.5 animate-spin" /> Ingesting
                            </span>
                          )}
                        </div>
                      </a>
                    )
                  })}
                </div>
              </section>
            )
          })
        )}
      </div>

      {showUpload && (
        <UploadManualModal
          aircraft={aircraft}
          defaultDocType={activeCategory === 'all' ? 'maintenance_manual' : activeCategory}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false)
            handleManualUploaded()
          }}
        />
      )}
    </div>
  )
}

// ─── Upload modal ──────────────────────────────────────────────────

function UploadManualModal({
  aircraft,
  defaultDocType,
  onClose,
  onUploaded,
}: {
  aircraft: AircraftOption[]
  defaultDocType: DocType
  onClose: () => void
  onUploaded: () => void
}) {
  const [aircraftId, setAircraftId] = useState<string>('')
  const [docType, setDocType] = useState<DocType>(defaultDocType)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast.error('Pick a PDF to upload')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('doc_type', docType)
      // Tag the manual to an aircraft so the library can be filtered by tail
      // and the Ask-from-aircraft surface can include only relevant manuals.
      if (aircraftId) formData.append('aircraft_id', aircraftId)
      if (title.trim()) formData.append('title', title.trim())
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || `Upload failed (${res.status})`)
        return
      }
      toast.success(`Manual uploaded — ingesting now`)
      onUploaded()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }, [file, docType, aircraftId, title, onUploaded])

  // Manual-relevant doc types only — owner-side types like 'logbook' are
  // intentionally excluded so a mechanic uploading a manual can't confuse
  // it with a per-aircraft logbook.
  const docTypeOptions: Array<{ key: DocType; label: string }> = [
    { key: 'parts_catalog',          label: 'Parts Catalog' },
    { key: 'maintenance_manual',     label: 'Maintenance Manual' },
    { key: 'service_manual',         label: 'Service Manual' },
    { key: 'service_bulletin',       label: 'Service Bulletin' },
    { key: 'airworthiness_directive', label: 'AD Reference' },
    { key: 'miscellaneous',          label: 'Other / Reference' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-border bg-gradient-to-br from-[#0A1628] to-[#1E3A5F]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                <Upload className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>Upload Manual</div>
                <div className="text-[11px] text-white/60">Tag the aircraft + manual type so it lands in the right shelf</div>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* File picker */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              PDF File
            </Label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center gap-3 text-left"
            >
              <FileText className="h-6 w-6 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                {file ? (
                  <>
                    <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>{file.name}</div>
                    <div className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Choose a PDF</div>
                    <div className="text-[11px] text-muted-foreground">Drop / click to pick a manual file</div>
                  </>
                )}
              </div>
              {file && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFile(f)
                  // Default the title to the filename (sans extension)
                  if (!title) setTitle(f.name.replace(/\.pdf$/i, ''))
                }
              }}
            />
          </div>

          {/* Aircraft picker */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Aircraft this manual applies to
            </Label>
            <div className="relative">
              <Plane className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={aircraftId}
                onChange={(e) => setAircraftId(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">— Library-wide (no specific aircraft) —</option>
                {aircraft.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tail_number}
                    {(a.make || a.model) ? ` — ${[a.make, a.model].filter(Boolean).join(' ')}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              When a mechanic asks the AI from inside that aircraft, this manual will be in scope.
            </p>
          </div>

          {/* Manual type picker */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Type of Manual
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {docTypeOptions.map((opt) => {
                const active = docType === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDocType(opt.key)}
                    className={cn(
                      'text-left px-3 py-2 rounded-lg border transition-all text-[13px]',
                      active
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30',
                    )}
                    style={{ fontWeight: 600 }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Title (optional)
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-derived from filename if blank"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2 bg-muted/20">
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button type="submit" disabled={uploading || !file}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading…</> : <><Upload className="h-4 w-4 mr-1" /> Upload</>}
          </Button>
        </div>
      </form>
    </div>
  )
}
