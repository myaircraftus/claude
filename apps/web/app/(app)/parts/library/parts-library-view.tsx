'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Search, Plus, Pencil, Trash2, Loader2, Package, DollarSign,
  Percent, Hash, Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/* ---------- types ---------- */

interface LibraryPart {
  id: string
  organization_id: string
  part_number: string
  title: string
  description: string | null
  image_url: string | null
  category: string | null
  preferred_vendor: string | null
  vendor_url: string | null
  base_price: number | null
  currency: string | null
  markup_mode: 'percent' | 'custom_rate' | 'none' | null
  markup_percent: number | null
  custom_rate: number | null
  condition: string | null
  last_ordered_at: string | null
  usage_count: number
  created_by: string | null
  created_at: string
}

const CATEGORIES = ['Engine', 'Avionics', 'Airframe', 'Propeller', 'General', 'Other'] as const
const CONDITIONS = ['New', 'Overhauled', 'Serviceable', 'As Removed', 'Repairable'] as const

/* ---------- helpers ---------- */

function localSellPrice(part: LibraryPart): number | null {
  const base = part.base_price
  if (base == null) return null
  switch (part.markup_mode) {
    case 'percent':
      return Math.round(base * (1 + (part.markup_percent ?? 0) / 100) * 100) / 100
    case 'custom_rate':
      return part.custom_rate != null ? Math.round(part.custom_rate * 100) / 100 : base
    default:
      return base
  }
}

function formatPrice(v: number | null, currency?: string | null): string {
  if (v == null) return '--'
  return `$${v.toFixed(2)}${currency && currency !== 'USD' ? ` ${currency}` : ''}`
}

function markupLabel(part: LibraryPart): string | null {
  if (part.markup_mode === 'percent' && part.markup_percent)
    return `+${part.markup_percent}%`
  if (part.markup_mode === 'custom_rate' && part.custom_rate != null)
    return 'Custom'
  return null
}

/* ---------- empty form ---------- */

function emptyForm() {
  return {
    part_number: '',
    title: '',
    category: 'General',
    base_price: '',
    markup_mode: 'none' as 'percent' | 'custom_rate' | 'none',
    markup_percent: '',
    custom_rate: '',
    preferred_vendor: '',
    condition: '',
    description: '',
  }
}

/* ---------- main component ---------- */

interface Props {
  initialParts: LibraryPart[]
}

export function PartsLibraryView({ initialParts }: Props) {
  const [parts, setParts] = useState<LibraryPart[]>(initialParts)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPart, setEditingPart] = useState<LibraryPart | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [computedSell, setComputedSell] = useState<number | null>(null)
  const [computedMarkup, setComputedMarkup] = useState<number | null>(null)

  // Filter parts client-side for instant feel
  const filtered = useMemo(() => {
    let list = parts
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        p =>
          p.part_number.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          (p.preferred_vendor ?? '').toLowerCase().includes(q)
      )
    }
    if (activeCategory) {
      list = list.filter(p => p.category === activeCategory)
    }
    return list
  }, [parts, search, activeCategory])

  // Live markup computation
  const computeMarkup = useCallback(async (basePrice: string, mode: string, pct: string, rate: string) => {
    const bp = parseFloat(basePrice)
    if (isNaN(bp) || !mode || mode === 'none') {
      setComputedSell(bp && !isNaN(bp) ? bp : null)
      setComputedMarkup(0)
      return
    }
    try {
      const resp = await fetch('/api/parts/library/apply-markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_price: bp,
          markup_mode: mode,
          markup_percent: parseFloat(pct) || 0,
          custom_rate: parseFloat(rate) || null,
        }),
      })
      const j = await resp.json()
      setComputedSell(j.sell_price)
      setComputedMarkup(j.markup_amount)
    } catch {
      // Fallback to local calc
      if (mode === 'percent') {
        const m = bp * ((parseFloat(pct) || 0) / 100)
        setComputedSell(Math.round((bp + m) * 100) / 100)
        setComputedMarkup(Math.round(m * 100) / 100)
      } else if (mode === 'custom_rate') {
        const cr = parseFloat(rate) || bp
        setComputedSell(cr)
        setComputedMarkup(Math.round((cr - bp) * 100) / 100)
      }
    }
  }, [])

  // Trigger markup recalc when form changes
  useEffect(() => {
    const t = setTimeout(() => {
      computeMarkup(form.base_price, form.markup_mode, form.markup_percent, form.custom_rate)
    }, 200)
    return () => clearTimeout(t)
  }, [form.base_price, form.markup_mode, form.markup_percent, form.custom_rate, computeMarkup])

  function openAddDialog() {
    setEditingPart(null)
    setForm(emptyForm())
    setComputedSell(null)
    setComputedMarkup(null)
    setDialogOpen(true)
  }

  function openEditDialog(part: LibraryPart) {
    setEditingPart(part)
    setForm({
      part_number: part.part_number,
      title: part.title,
      category: part.category ?? 'General',
      base_price: part.base_price != null ? String(part.base_price) : '',
      markup_mode: part.markup_mode ?? 'none',
      markup_percent: part.markup_percent != null ? String(part.markup_percent) : '',
      custom_rate: part.custom_rate != null ? String(part.custom_rate) : '',
      preferred_vendor: part.preferred_vendor ?? '',
      condition: part.condition ?? '',
      description: part.description ?? '',
    })
    setComputedSell(localSellPrice(part))
    setComputedMarkup(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.part_number.trim() || !form.title.trim()) return
    setSaving(true)

    const payload: Record<string, unknown> = {
      part_number: form.part_number.trim(),
      title: form.title.trim(),
      category: form.category,
      base_price: form.base_price ? parseFloat(form.base_price) : null,
      markup_mode: form.markup_mode,
      markup_percent: form.markup_percent ? parseFloat(form.markup_percent) : null,
      custom_rate: form.custom_rate ? parseFloat(form.custom_rate) : null,
      preferred_vendor: form.preferred_vendor.trim() || null,
      condition: form.condition || null,
      description: form.description.trim() || null,
    }

    try {
      const isEdit = !!editingPart
      const url = isEdit ? `/api/parts/library/${editingPart!.id}` : '/api/parts/library'
      const method = isEdit ? 'PATCH' : 'POST'

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error ?? 'Save failed')

      if (isEdit) {
        setParts(prev => prev.map(p => (p.id === editingPart!.id ? result : p)))
      } else {
        setParts(prev => [result, ...prev])
      }
      setDialogOpen(false)
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this part from the library?')) return
    setDeleting(id)
    try {
      const resp = await fetch(`/api/parts/library/${id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const j = await resp.json()
        throw new Error(j.error ?? 'Delete failed')
      }
      setParts(prev => prev.filter(p => p.id !== id))
    } catch (err: any) {
      toast.error(err?.message ?? 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Parts Library</h1>
          <p className="text-muted-foreground text-sm">
            Saved parts with pricing and markup. Auto-populated when you order.
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Part
        </Button>
      </div>

      {/* Search + Category Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search part number, title, or vendor..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
              !activeCategory
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
            )}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                activeCategory === cat
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} part{filtered.length !== 1 ? 's' : ''}</span>
        {search && <span>matching &quot;{search}&quot;</span>}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Package className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-foreground">No parts in library</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add parts manually or they auto-save when you click &quot;Open at vendor.&quot;
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(part => {
            const sell = localSellPrice(part)
            const ml = markupLabel(part)
            return (
              <div
                key={part.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 group"
              >
                {/* Top row: part number + category */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {part.part_number}
                    </span>
                    {part.category && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {part.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEditDialog(part)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(part.id)}
                      disabled={deleting === part.id}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Delete"
                    >
                      {deleting === part.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                  {part.title}
                </h3>

                {/* Vendor */}
                {part.preferred_vendor && (
                  <p className="text-xs text-muted-foreground truncate">
                    {part.preferred_vendor}
                  </p>
                )}

                {/* Pricing row */}
                <div className="flex items-baseline gap-2 mt-auto pt-1">
                  {part.base_price != null && (
                    <span className="text-xs text-muted-foreground line-through tabular-nums">
                      {formatPrice(part.base_price, part.currency)}
                    </span>
                  )}
                  {sell != null && (
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {formatPrice(sell, part.currency)}
                    </span>
                  )}
                  {ml && (
                    <Badge variant="info" className="text-[10px]">
                      {ml}
                    </Badge>
                  )}
                </div>

                {/* Footer: condition + usage */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {part.condition && (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {part.condition}
                    </Badge>
                  )}
                  {part.usage_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Hash className="h-3 w-3" />
                      {part.usage_count} order{part.usage_count !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPart ? 'Edit Library Part' : 'Add Part to Library'}</DialogTitle>
            <DialogDescription>
              {editingPart
                ? 'Update part details, pricing, and markup.'
                : 'Save a part to your library for quick reuse and pricing.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Part Number + Title */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pn">Part Number *</Label>
                <Input
                  id="pn"
                  value={form.part_number}
                  onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))}
                  placeholder="e.g. CH48110-1"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Oil Filter"
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Base Price */}
            <div className="space-y-1.5">
              <Label htmlFor="bp">
                <DollarSign className="h-3 w-3 inline mr-1" />
                Base Price (cost)
              </Label>
              <Input
                id="bp"
                type="number"
                step="0.01"
                min="0"
                value={form.base_price}
                onChange={e => setForm(f => ({ ...f, base_price: e.target.value }))}
                placeholder="0.00"
              />
            </div>

            {/* Markup Mode */}
            <div className="space-y-1.5">
              <Label>
                <Percent className="h-3 w-3 inline mr-1" />
                Markup Mode
              </Label>
              <Select
                value={form.markup_mode}
                onValueChange={v => setForm(f => ({ ...f, markup_mode: v as typeof f.markup_mode }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (sell at cost)</SelectItem>
                  <SelectItem value="percent">Percentage Markup</SelectItem>
                  <SelectItem value="custom_rate">Custom Sell Rate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional: markup percent */}
            {form.markup_mode === 'percent' && (
              <div className="space-y-1.5">
                <Label htmlFor="mpct">Markup Percent (%)</Label>
                <Input
                  id="mpct"
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.markup_percent}
                  onChange={e => setForm(f => ({ ...f, markup_percent: e.target.value }))}
                  placeholder="e.g. 20"
                />
              </div>
            )}

            {/* Conditional: custom rate */}
            {form.markup_mode === 'custom_rate' && (
              <div className="space-y-1.5">
                <Label htmlFor="cr">Custom Sell Rate ($)</Label>
                <Input
                  id="cr"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.custom_rate}
                  onChange={e => setForm(f => ({ ...f, custom_rate: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* Computed sell price preview */}
            {form.base_price && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border text-sm">
                <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <span className="text-muted-foreground">Sell price: </span>
                  <span className="font-bold text-foreground tabular-nums">
                    {computedSell != null ? formatPrice(computedSell) : '--'}
                  </span>
                  {computedMarkup != null && computedMarkup !== 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (markup: ${computedMarkup.toFixed(2)})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Vendor */}
            <div className="space-y-1.5">
              <Label htmlFor="vendor">Preferred Vendor</Label>
              <Input
                id="vendor"
                value={form.preferred_vendor}
                onChange={e => setForm(f => ({ ...f, preferred_vendor: e.target.value }))}
                placeholder="e.g. Aircraft Spruce"
              />
            </div>

            {/* Condition */}
            <div className="space-y-1.5">
              <Label>Condition</Label>
              <Select
                value={form.condition}
                onValueChange={v => setForm(f => ({ ...f, condition: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {CONDITIONS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.part_number.trim() || !form.title.trim()}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving...</>
              ) : editingPart ? (
                'Update Part'
              ) : (
                'Add Part'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
