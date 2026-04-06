'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X, Loader2, Package, ExternalLink, Star, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedPart {
  id: string
  part_number: string
  description: string
  vendor?: string | null
  unit_price?: number | null
  condition?: string | null
  category?: string | null
  use_count: number
  last_used_at: string
}

interface PartOrder {
  id: string
  part_number?: string | null
  description: string
  vendor?: string | null
  quantity: number
  unit_price?: number | null
  condition?: string | null
  status: string
  notes?: string | null
  created_at: string
  aircraft?: { tail_number: string } | null
}

interface Props {
  organizationId: string
  userRole: string
  aircraft: { id: string; tail_number: string; make: string; model: string; year?: number | null }[]
  onCountChange: (count: number) => void
}

const CONDITIONS = ['new', 'overhauled', 'serviceable', 'used'] as const
const ORDER_STATUSES = ['pending', 'ordered', 'received', 'cancelled'] as const

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  ordered: 'bg-blue-100 text-blue-800 border-blue-200',
  received: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
}

// ─── Atlas Search Panel ───────────────────────────────────────────────────────

function AtlasSearchPanel({ onSelectPart }: {
  onSelectPart: (part: { partNumber: string; description: string; vendor: string; price?: number }) => void
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [searched, setSearched] = useState(false)

  const search = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/parts/search?q=${encodeURIComponent(query)}&limit=20`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [query])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Atlas Parts Network</h3>
        <p className="text-xs text-muted-foreground">
          Research tool — browse results and click a vendor link to order. Use "Map to Order" to pre-fill a manual order form.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-background"
          placeholder="Part number or description..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {searched && !loading && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No results found.</p>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {results.map((r, i) => (
          <div key={i} className="border border-border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{r.title ?? r.partNumber}</p>
                {r.partNumber && <p className="text-xs text-muted-foreground">P/N: {r.partNumber}</p>}
                {r.vendor && <p className="text-xs text-muted-foreground">{r.vendor}</p>}
                {r.price && <p className="text-sm font-semibold text-foreground mt-1">${r.price.toFixed(2)}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {r.productUrl && (
                  <a
                    href={r.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-border rounded-md hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Order
                  </a>
                )}
                <button
                  onClick={() => onSelectPart({
                    partNumber: r.partNumber ?? '',
                    description: r.title ?? '',
                    vendor: r.vendor ?? '',
                    price: r.price,
                  })}
                  className="px-2.5 py-1 text-xs font-medium bg-foreground text-background rounded-md hover:opacity-90"
                >
                  Map to Order
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Add Order Modal ──────────────────────────────────────────────────────────

function AddOrderModal({
  organizationId,
  aircraft,
  prefill,
  onClose,
  onSaved,
}: {
  organizationId: string
  aircraft: Props['aircraft']
  prefill?: { partNumber: string; description: string; vendor: string; price?: number }
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    aircraft_id: '',
    part_number: prefill?.partNumber ?? '',
    description: prefill?.description ?? '',
    vendor: prefill?.vendor ?? '',
    quantity: '1',
    unit_price: prefill?.price ? String(prefill.price) : '',
    condition: 'new' as typeof CONDITIONS[number],
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      await fetch('/api/part-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          aircraft_id: form.aircraft_id || null,
          part_number: form.part_number || null,
          description: form.description,
          vendor: form.vendor || null,
          quantity: parseFloat(form.quantity) || 1,
          unit_price: form.unit_price ? parseFloat(form.unit_price) : null,
          condition: form.condition,
          notes: form.notes || null,
          status: 'pending',
        }),
      })
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const f = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl border border-border w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Add Part Order</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Aircraft</label>
            <select
              value={form.aircraft_id}
              onChange={e => f('aircraft_id', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            >
              <option value="">— Any / General —</option>
              {aircraft.map(a => (
                <option key={a.id} value={a.id}>{a.tail_number} — {a.make} {a.model}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Part Number</label>
              <input value={form.part_number} onChange={e => f('part_number', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" placeholder="e.g. LW-14060" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Vendor</label>
              <input value={form.vendor} onChange={e => f('vendor', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" placeholder="e.g. Aircraft Spruce" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Description <span className="text-red-500">*</span></label>
            <input value={form.description} onChange={e => f('description', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" placeholder="Part description" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Qty</label>
              <input type="number" min="1" value={form.quantity} onChange={e => f('quantity', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Unit Price</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => f('unit_price', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background" placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Condition</label>
              <select value={form.condition} onChange={e => f('condition', e.target.value as typeof CONDITIONS[number])}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background">
                {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.description.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Order
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PartsOrderingTab({ organizationId, userRole, aircraft, onCountChange }: Props) {
  const [orders, setOrders] = useState<PartOrder[]>([])
  const [savedParts, setSavedParts] = useState<SavedPart[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [atlasOpen, setAtlasOpen] = useState(false)
  const [prefill, setPrefill] = useState<{ partNumber: string; description: string; vendor: string; price?: number } | undefined>()
  const [savedFilter, setSavedFilter] = useState('')

  const canWrite = ['owner', 'admin', 'mechanic'].includes(userRole)

  const loadOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams({ org: organizationId })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/part-orders?${params}`)
      const data = await res.json()
      const list: PartOrder[] = data.orders ?? []
      setOrders(list)
      onCountChange(list.filter(o => o.status === 'pending' || o.status === 'ordered').length)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [organizationId, statusFilter, onCountChange])

  const loadSavedParts = useCallback(async () => {
    try {
      const res = await fetch(`/api/saved-parts?org=${organizationId}`)
      const data = await res.json()
      setSavedParts(data.parts ?? [])
    } catch {
      setSavedParts([])
    }
  }, [organizationId])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => { loadSavedParts() }, [loadSavedParts])

  const updateOrderStatus = async (id: string, status: string) => {
    await fetch(`/api/part-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadOrders()
  }

  const deleteOrder = async (id: string) => {
    if (!confirm('Delete this part order?')) return
    await fetch(`/api/part-orders/${id}`, { method: 'DELETE' })
    loadOrders()
  }

  const handleAtlasSelect = (part: { partNumber: string; description: string; vendor: string; price?: number }) => {
    setPrefill(part)
    setAtlasOpen(false)
    setShowAddModal(true)
  }

  const filteredOrders = orders.filter(o => {
    const s = search.toLowerCase()
    if (s && !o.description.toLowerCase().includes(s) &&
        !(o.part_number ?? '').toLowerCase().includes(s) &&
        !(o.vendor ?? '').toLowerCase().includes(s)) return false
    return true
  })

  const filteredSaved = savedParts.filter(p => {
    const s = savedFilter.toLowerCase()
    if (!s) return true
    return p.description.toLowerCase().includes(s) ||
      p.part_number.toLowerCase().includes(s) ||
      (p.vendor ?? '').toLowerCase().includes(s)
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-foreground">Parts & Ordering</h2>
          <div className="flex gap-1">
            {(['all', ...ORDER_STATUSES] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                  statusFilter === s
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-background text-muted-foreground border-border hover:text-foreground'
                )}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAtlasOpen(p => !p)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors',
                atlasOpen ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'
              )}
            >
              <Search className="h-4 w-4" />
              Atlas Search
            </button>
            <button
              onClick={() => { setPrefill(undefined); setShowAddModal(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add Order
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Orders */}
        <div className={cn('flex flex-col overflow-hidden', atlasOpen ? 'w-1/2' : 'flex-1')}>
          {/* Search */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-muted/30"
                placeholder="Search orders..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Orders list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <Package className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">No part orders</p>
                <p className="text-xs text-muted-foreground mt-1">Add a manual order or use Atlas Search to research parts.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredOrders.map(order => (
                  <div key={order.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            'text-xs font-semibold px-2 py-0.5 rounded-full border',
                            statusColor[order.status] ?? 'bg-muted text-muted-foreground border-border'
                          )}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                          {order.part_number && (
                            <span className="text-xs font-mono text-muted-foreground">{order.part_number}</span>
                          )}
                          {order.aircraft && (
                            <span className="text-xs text-muted-foreground">{order.aircraft.tail_number}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground mt-1 truncate">{order.description}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {order.vendor && <span>{order.vendor}</span>}
                          <span>Qty: {order.quantity}</span>
                          {order.unit_price && <span>${(order.unit_price * order.quantity).toFixed(2)}</span>}
                          {order.condition && <span className="capitalize">{order.condition}</span>}
                        </div>
                        {order.notes && <p className="text-xs text-muted-foreground mt-1 italic">{order.notes}</p>}
                      </div>
                      {canWrite && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <select
                            value={order.status}
                            onChange={e => updateOrderStatus(order.id, e.target.value)}
                            className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                          >
                            {ORDER_STATUSES.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => deleteOrder(order.id)}
                            className="flex items-center justify-center p-1 text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Parts catalog */}
          <div className="border-t border-border shrink-0">
            <div className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">Saved Parts Catalog</span>
                <span className="text-xs text-muted-foreground">({savedParts.length})</span>
              </div>
              <button onClick={loadSavedParts} className="p-1 text-muted-foreground hover:text-foreground">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-4 pb-2">
              <input
                className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-muted/30"
                placeholder="Filter saved parts..."
                value={savedFilter}
                onChange={e => setSavedFilter(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredSaved.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {savedParts.length === 0
                    ? 'Parts added to work orders appear here for quick access.'
                    : 'No matches for your filter.'}
                </p>
              ) : (
                <div className="px-2 pb-2 flex flex-wrap gap-2">
                  {filteredSaved.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPrefill({
                          partNumber: p.part_number,
                          description: p.description,
                          vendor: p.vendor ?? '',
                          price: p.unit_price ?? undefined,
                        })
                        setShowAddModal(true)
                      }}
                      className="flex flex-col items-start px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="text-xs font-semibold text-foreground">{p.part_number}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-40">{p.description}</span>
                      {p.vendor && <span className="text-xs text-muted-foreground">{p.vendor}</span>}
                      {p.unit_price && <span className="text-xs font-medium text-foreground">${p.unit_price.toFixed(2)}</span>}
                      <span className="text-xs text-muted-foreground">Used {p.use_count}×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Atlas Search Panel */}
        {atlasOpen && (
          <div className="w-1/2 border-l border-border overflow-y-auto p-5">
            <AtlasSearchPanel onSelectPart={handleAtlasSelect} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddOrderModal
          organizationId={organizationId}
          aircraft={aircraft}
          prefill={prefill}
          onClose={() => { setShowAddModal(false); setPrefill(undefined) }}
          onSaved={loadOrders}
        />
      )}
    </div>
  )
}
