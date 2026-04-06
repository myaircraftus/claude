'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, X, ChevronRight, Loader2, Plane, Clock,
  Building2, Wrench, AlertTriangle, CheckCircle, FileText,
  DollarSign, Printer, Mail, Share2, Trash2, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WOLine {
  id: string
  line_type: 'labor' | 'part' | 'outside_service' | 'note'
  description: string
  quantity: number
  unit_price: number
  line_total: number
  hours?: number | null
  rate?: number | null
  part_number?: string | null
  vendor?: string | null
  condition?: string | null
  status: string
  notes?: string | null
}

interface WorkOrder {
  id: string
  work_order_number: string
  status: string
  complaint?: string | null
  discrepancy?: string | null
  findings?: string | null
  corrective_action?: string | null
  labor_total: number
  parts_total: number
  outside_services_total: number
  total_amount: number
  internal_notes?: string | null
  customer_visible_notes?: string | null
  opened_at: string
  closed_at?: string | null
  invoiced_at?: string | null
  aircraft?: { id: string; tail_number: string; make: string; model: string } | null
  mechanic?: { id: string; email: string; user_profiles?: { full_name?: string } | null } | null
  lines?: WOLine[]
}

interface Props {
  organizationId: string
  userRole: string
  userId: string
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  members: { id: string; name: string; role: string }[]
  onCountChange: (n: number) => void
}

// ─── Status config ─────────────────────────────────────────────────────────────

const STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'open', label: 'Open', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'awaiting_parts', label: 'Awaiting Parts', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'awaiting_approval', label: 'Awaiting Approval', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'ready_for_signoff', label: 'Ready for Signoff', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { value: 'closed', label: 'Closed', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'invoiced', label: 'Invoiced', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'archived', label: 'Archived', color: 'bg-gray-50 text-gray-400 border-gray-100' },
]

function statusConfig(status: string) {
  return STATUSES.find(s => s.value === status) ?? { label: status, color: 'bg-gray-100 text-gray-600 border-gray-200' }
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }

// ─── Main Component ────────────────────────────────────────────────────────────

export function WorkOrdersTab({ organizationId, userRole, userId, aircraft, members, onCountChange }: Props) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNewModal, setShowNewModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showAddLineModal, setShowAddLineModal] = useState<'labor' | 'part' | null>(null)

  const canWrite = ['owner', 'admin', 'mechanic'].includes(userRole)

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/work-orders?${params}`)
    if (res.ok) {
      const data = await res.json() as { workOrders: WorkOrder[] }
      const list = data.workOrders ?? []
      setWorkOrders(list)
      onCountChange(list.filter(w => !['closed', 'archived', 'paid'].includes(w.status)).length)
    }
    setLoading(false)
  }, [statusFilter, onCountChange])

  useEffect(() => { fetchList() }, [fetchList])

  // ── Fetch detail ────────────────────────────────────────────────────────────
  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    const res = await fetch(`/api/work-orders/${id}`)
    if (res.ok) {
      const data = await res.json() as WorkOrder
      setSelectedWO(data)
    }
    setDetailLoading(false)
  }, [])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else setSelectedWO(null)
  }, [selectedId, fetchDetail])

  // ── Status update ───────────────────────────────────────────────────────────
  async function updateStatus(status: string) {
    if (!selectedId) return
    if (status === 'invoiced') { setShowInvoiceModal(true); return }
    await fetch(`/api/work-orders/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await fetchDetail(selectedId)
    await fetchList()
  }

  // ── Save WO fields ──────────────────────────────────────────────────────────
  async function saveField(field: string, value: string) {
    if (!selectedId) return
    await fetch(`/api/work-orders/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
  }

  // ── Delete line ─────────────────────────────────────────────────────────────
  async function deleteLine(lineId: string) {
    if (!selectedId) return
    await fetch(`/api/work-orders/${selectedId}/lines?line_id=${lineId}`, { method: 'DELETE' })
    await fetchDetail(selectedId)
  }

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = workOrders.filter(wo => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      wo.work_order_number.toLowerCase().includes(q) ||
      wo.aircraft?.tail_number.toLowerCase().includes(q) ||
      (wo.complaint ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: list ── */}
      <div className="w-80 flex-shrink-0 border-r border-border flex flex-col overflow-hidden">
        {/* List header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-foreground text-sm">Work Orders</h2>
            {canWrite && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-foreground text-background text-xs font-semibold rounded-lg hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            )}
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search work orders..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none"
          >
            <option value="all">All Status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <ClipboardListIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No work orders</p>
              {canWrite && (
                <button onClick={() => setShowNewModal(true)} className="text-xs text-blue-600 mt-1 hover:underline">
                  Create one →
                </button>
              )}
            </div>
          ) : filtered.map(wo => {
            const sc = statusConfig(wo.status)
            return (
              <button
                key={wo.id}
                onClick={() => setSelectedId(wo.id === selectedId ? null : wo.id)}
                className={cn(
                  'w-full text-left p-4 border-b border-border hover:bg-accent transition-colors',
                  selectedId === wo.id && 'bg-accent'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-foreground">{wo.work_order_number}</span>
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', sc.color)}>{sc.label}</span>
                </div>
                {wo.aircraft && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Plane className="h-3 w-3" />
                    {wo.aircraft.tail_number} — {wo.aircraft.make} {wo.aircraft.model}
                  </p>
                )}
                {wo.complaint && (
                  <p className="text-xs text-foreground mt-1 line-clamp-1">{wo.complaint}</p>
                )}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-muted-foreground">{fmtDate(wo.opened_at)}</span>
                  <span className="text-xs font-semibold text-foreground">{fmt(wo.total_amount)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Right: detail ── */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a work order to view details</p>
            </div>
          </div>
        ) : detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : selectedWO ? (
          <WorkOrderDetail
            wo={selectedWO}
            canWrite={canWrite}
            aircraft={aircraft}
            members={members}
            onStatusChange={updateStatus}
            onSaveField={saveField}
            onDeleteLine={deleteLine}
            onAddLine={() => setShowAddLineModal('part')}
            onAddLabor={() => setShowAddLineModal('labor')}
            onInvoice={() => setShowInvoiceModal(true)}
            onRefresh={() => { fetchDetail(selectedWO.id); fetchList() }}
          />
        ) : null}
      </div>

      {/* ── New WO Modal ── */}
      {showNewModal && (
        <NewWorkOrderModal
          aircraft={aircraft}
          members={members}
          onClose={() => setShowNewModal(false)}
          onCreated={id => {
            setShowNewModal(false)
            setSelectedId(id)
            fetchList()
          }}
        />
      )}

      {/* ── Add Line Modal ── */}
      {showAddLineModal && selectedWO && (
        <AddLineModal
          workOrderId={selectedWO.id}
          lineType={showAddLineModal}
          onClose={() => setShowAddLineModal(null)}
          onAdded={() => { setShowAddLineModal(null); fetchDetail(selectedWO.id) }}
          organizationId={organizationId}
        />
      )}

      {/* ── Invoice Modal ── */}
      {showInvoiceModal && selectedWO && (
        <InvoiceModal
          wo={selectedWO}
          onClose={() => setShowInvoiceModal(false)}
          onInvoiced={() => { setShowInvoiceModal(false); fetchDetail(selectedWO.id); fetchList() }}
        />
      )}
    </div>
  )
}

// ─── Work Order Detail ─────────────────────────────────────────────────────────

function WorkOrderDetail({
  wo, canWrite, aircraft, members,
  onStatusChange, onSaveField, onDeleteLine, onAddLine, onAddLabor, onInvoice, onRefresh,
}: {
  wo: WorkOrder
  canWrite: boolean
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  members: { id: string; name: string; role: string }[]
  onStatusChange: (s: string) => void
  onSaveField: (f: string, v: string) => void
  onDeleteLine: (id: string) => void
  onAddLine: () => void
  onAddLabor: () => void
  onInvoice: () => void
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  function startEdit(field: string, current: string | null | undefined) {
    setEditing(field)
    setEditValues(prev => ({ ...prev, [field]: current ?? '' }))
  }

  async function saveEdit(field: string) {
    await onSaveField(field, editValues[field] ?? '')
    setEditing(null)
    onRefresh()
  }

  const sc = statusConfig(wo.status)
  const laborLines = (wo.lines ?? []).filter(l => l.line_type === 'labor')
  const partLines = (wo.lines ?? []).filter(l => l.line_type === 'part')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Status bar */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              disabled={!canWrite}
              onClick={() => onStatusChange(s.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                wo.status === s.value
                  ? s.color + ' ring-2 ring-offset-1 ring-current'
                  : 'bg-background border-border text-muted-foreground hover:border-foreground/30'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Info row */}
      <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Aircraft</p>
          <p className="font-medium">{wo.aircraft ? `${wo.aircraft.tail_number} / ${wo.aircraft.make} ${wo.aircraft.model}` : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Mechanic</p>
          <p className="font-medium">{wo.mechanic?.user_profiles?.full_name ?? wo.mechanic?.email ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Opened</p>
          <p className="font-medium">{fmtDate(wo.opened_at)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">WO #</p>
          <p className="font-mono font-bold">{wo.work_order_number}</p>
        </div>
      </div>

      {/* Squawk / Findings / Corrective */}
      {(['complaint', 'discrepancy', 'corrective_action'] as const).map(field => {
        const labels: Record<string, string> = {
          complaint: 'Squawk / Customer Complaint',
          discrepancy: 'Discrepancy / Findings',
          corrective_action: 'Corrective Action',
        }
        return (
          <div key={field} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{labels[field]}</p>
            {editing === field ? (
              <div className="space-y-2">
                <textarea
                  value={editValues[field] ?? ''}
                  onChange={e => setEditValues(prev => ({ ...prev, [field]: e.target.value }))}
                  rows={3}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(field)} className="px-3 py-1.5 bg-foreground text-background text-xs rounded-lg font-semibold"><Save className="h-3 w-3 inline mr-1" />Save</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border border-border rounded-lg">Cancel</button>
                </div>
              </div>
            ) : (
              <p
                className={cn('text-sm cursor-pointer hover:text-foreground', wo[field] ? 'text-foreground' : 'text-muted-foreground italic')}
                onClick={() => canWrite && startEdit(field, wo[field])}
              >
                {wo[field] ?? 'None entered — click to add'}
              </p>
            )}
          </div>
        )
      })}

      {/* Labor */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Labor</p>
          {canWrite && (
            <button onClick={onAddLabor} className="text-xs text-blue-600 hover:underline">+ Add Labor</button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left pb-2 font-medium">Description</th>
              <th className="text-right pb-2 font-medium">Hours</th>
              <th className="text-right pb-2 font-medium">Rate</th>
              <th className="text-right pb-2 font-medium">Amount</th>
              {canWrite && <th className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {laborLines.length === 0 ? (
              <tr><td colSpan={5} className="py-4 text-center text-muted-foreground text-xs">No labor recorded</td></tr>
            ) : laborLines.map(line => {
              const amount = line.hours && line.rate ? line.hours * line.rate : line.line_total
              return (
                <tr key={line.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2">{line.description}</td>
                  <td className="text-right py-2">{line.hours ?? line.quantity}</td>
                  <td className="text-right py-2">${line.rate ?? line.unit_price}</td>
                  <td className="text-right py-2 font-medium">{fmt(amount)}</td>
                  {canWrite && (
                    <td className="py-2 pl-2">
                      <button onClick={() => onDeleteLine(line.id)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Parts */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parts</p>
          {canWrite && (
            <button onClick={onAddLine} className="text-xs text-blue-600 hover:underline">+ Add Part</button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left pb-2 font-medium">P/N</th>
              <th className="text-left pb-2 font-medium">Description</th>
              <th className="text-right pb-2 font-medium">Qty</th>
              <th className="text-right pb-2 font-medium">Unit</th>
              <th className="text-right pb-2 font-medium">Total</th>
              {canWrite && <th className="w-6" />}
            </tr>
          </thead>
          <tbody>
            {partLines.length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-muted-foreground text-xs">No parts recorded</td></tr>
            ) : partLines.map(line => (
              <tr key={line.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 font-mono text-xs">{line.part_number ?? '—'}</td>
                <td className="py-2">{line.description}</td>
                <td className="text-right py-2">{line.quantity}</td>
                <td className="text-right py-2">{fmt(line.unit_price)}</td>
                <td className="text-right py-2 font-medium">{fmt(line.line_total)}</td>
                {canWrite && (
                  <td className="py-2 pl-2">
                    <button onClick={() => onDeleteLine(line.id)} className="text-muted-foreground hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Labor ({laborLines.reduce((s, l) => s + (l.hours ?? 0), 0)} hrs)</span>
          <span>{fmt(wo.labor_total)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Parts</span>
          <span>{fmt(wo.parts_total)}</span>
        </div>
        <div className="flex justify-between font-bold text-foreground text-base border-t border-border pt-2 mt-2">
          <span>Total</span>
          <span>{fmt(wo.total_amount)}</span>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-2 gap-4">
        {(['internal_notes', 'customer_visible_notes'] as const).map(field => {
          const labels: Record<string, string> = { internal_notes: 'Internal Notes', customer_visible_notes: 'Customer Notes' }
          return (
            <div key={field}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{labels[field]}</p>
              {editing === field ? (
                <div className="space-y-2">
                  <textarea
                    value={editValues[field] ?? ''}
                    onChange={e => setEditValues(prev => ({ ...prev, [field]: e.target.value }))}
                    rows={3}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(field)} className="px-2 py-1 bg-foreground text-background text-xs rounded font-semibold">Save</button>
                    <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs border border-border rounded">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className={cn('text-sm cursor-pointer', wo[field] ? 'text-foreground' : 'text-muted-foreground italic')}
                  onClick={() => canWrite && startEdit(field, wo[field])}>
                  {wo[field] ?? 'None'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      {canWrite && (
        <div className="flex flex-wrap gap-2 pb-8">
          <button className="flex items-center gap-2 px-4 py-2 bg-foreground text-background text-sm font-semibold rounded-lg hover:opacity-90">
            <FileText className="h-4 w-4" />
            Generate Logbook Entry
          </button>
          <button
            onClick={onInvoice}
            className="flex items-center gap-2 px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-accent"
          >
            <DollarSign className="h-4 w-4" />
            Generate Invoice
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-accent">
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-lg hover:bg-accent">
            <Mail className="h-4 w-4" />
            Email Customer
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Modals ────────────────────────────────────────────────────────────────────

function NewWorkOrderModal({
  aircraft, members, onClose, onCreated,
}: {
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  members: { id: string; name: string }[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [mechanicId, setMechanicId] = useState('')
  const [complaint, setComplaint] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    const res = await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraft_id: aircraftId || null,
        assigned_mechanic_id: mechanicId || null,
        complaint: complaint || null,
        internal_notes: notes || null,
      }),
    })
    if (res.ok) {
      const data = await res.json() as { id: string }
      onCreated(data.id)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">New Work Order</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Aircraft</label>
            <select value={aircraftId} onChange={e => setAircraftId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none">
              <option value="">No aircraft</option>
              {aircraft.map(ac => <option key={ac.id} value={ac.id}>{ac.tail_number} — {ac.make} {ac.model}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Assigned Mechanic</label>
            <select value={mechanicId} onChange={e => setMechanicId(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none">
              <option value="">Select mechanic</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Squawk / Customer Complaint</label>
            <textarea value={complaint} onChange={e => setComplaint(e.target.value)} rows={3}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              placeholder="Describe the reported issue..." />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Internal Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
              placeholder="Any internal notes..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 text-sm bg-foreground text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Work Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddLineModal({
  workOrderId, lineType, onClose, onAdded, organizationId,
}: {
  workOrderId: string
  lineType: 'labor' | 'part'
  onClose: () => void
  onAdded: () => void
  organizationId: string
}) {
  const [desc, setDesc] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [vendor, setVendor] = useState('')
  const [condition, setCondition] = useState('new')
  const [qty, setQty] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [hours, setHours] = useState(0)
  const [rate, setRate] = useState(125)
  const [saving, setSaving] = useState(false)
  const [savedParts, setSavedParts] = useState<{ part_number: string; description: string; vendor?: string; unit_price?: number; use_count: number }[]>([])

  useEffect(() => {
    if (lineType === 'part') {
      fetch(`/api/saved-parts?org=${organizationId}`)
        .then(r => r.ok ? r.json() as Promise<{ parts: typeof savedParts }> : { parts: [] })
        .then(d => setSavedParts(d.parts ?? []))
        .catch(() => {})
    }
  }, [lineType, organizationId])

  async function submit() {
    setSaving(true)
    const body = lineType === 'labor'
      ? { line_type: 'labor', description: desc, quantity: hours, unit_price: rate, hours, rate }
      : { line_type: 'part', description: desc, part_number: partNumber || null, vendor: vendor || null, condition, quantity: qty, unit_price: unitPrice }

    await fetch(`/api/work-orders/${workOrderId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    onAdded()
  }

  function applySaved(p: typeof savedParts[0]) {
    setDesc(p.description)
    setPartNumber(p.part_number)
    setVendor(p.vendor ?? '')
    setUnitPrice(p.unit_price ?? 0)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border border-border w-full max-w-lg shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-foreground">{lineType === 'labor' ? 'Add Labor' : 'Add Part'}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Saved parts quick-add (parts only) */}
          {lineType === 'part' && savedParts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Saved Parts — click to use</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {savedParts.map(p => (
                  <button key={p.part_number} onClick={() => applySaved(p)}
                    className="text-xs px-2.5 py-1.5 bg-muted hover:bg-accent border border-border rounded-lg text-left transition-colors">
                    <span className="font-mono font-semibold">{p.part_number}</span>
                    <span className="text-muted-foreground ml-1.5">{p.description.slice(0, 30)}</span>
                    {p.use_count > 1 && <span className="text-muted-foreground ml-1">×{p.use_count}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Description *</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
              placeholder={lineType === 'labor' ? 'Labor — inspection & repair' : 'Part description'} />
          </div>

          {lineType === 'labor' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Hours</label>
                <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} step="0.5" min="0"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Rate ($/hr)</label>
                <input type="number" value={rate} onChange={e => setRate(Number(e.target.value))} min="0"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none" />
              </div>
              <div className="col-span-2 text-sm font-semibold text-foreground text-right">
                Total: ${(hours * rate).toFixed(2)}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Part Number</label>
                  <input value={partNumber} onChange={e => setPartNumber(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono bg-background focus:outline-none"
                    placeholder="e.g. CH48110-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Vendor</label>
                  <input value={vendor} onChange={e => setVendor(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none"
                    placeholder="Aircraft Spruce" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none">
                    <option value="new">New</option>
                    <option value="overhauled">Overhauled</option>
                    <option value="serviceable">Serviceable</option>
                    <option value="used">Used</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Qty</label>
                  <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min="1"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground mb-1 block">Unit Price</label>
                  <input type="number" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))} min="0" step="0.01"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none" />
                </div>
                <div className="flex items-end pb-2">
                  <p className="text-sm font-semibold text-foreground">Total: ${(qty * unitPrice).toFixed(2)}</p>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 p-4 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={saving || !desc}
            className="px-4 py-2 text-sm bg-foreground text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InvoiceModal({ wo, onClose, onInvoiced }: { wo: WorkOrder; onClose: () => void; onInvoiced: () => void }) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function generate() {
    setSaving(true)
    await fetch(`/api/work-orders/${wo.id}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setSaving(false)
    setDone(true)
  }

  async function markPaid() {
    await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    onInvoiced()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border border-border w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{done ? 'Invoice Generated' : 'Generate Invoice'}</h3>
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>
        {!done ? (
          <div className="p-4 space-y-4">
            {/* Summary */}
            <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Work Order</span><span className="font-mono font-bold">{wo.work_order_number}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Aircraft</span><span>{wo.aircraft?.tail_number ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span>{fmt(wo.labor_total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>{fmt(wo.parts_total)}</span></div>
              <div className="flex justify-between font-bold border-t border-border pt-2 mt-1"><span>Total</span><span>{fmt(wo.total_amount)}</span></div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Customer Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none resize-none"
                placeholder="Thank you for your business..." />
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">Invoice Generated</p>
            <p className="text-sm text-muted-foreground mb-6">Work order is now marked as Invoiced. You can mark it as paid once payment is received.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Close</button>
              <button onClick={markPaid} className="px-4 py-2 text-sm bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">
                Mark as Paid
              </button>
            </div>
          </div>
        )}
        {!done && (
          <div className="flex justify-end gap-3 p-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent">Cancel</button>
            <button onClick={generate} disabled={saving}
              className="px-4 py-2 text-sm bg-foreground text-background font-semibold rounded-lg hover:opacity-90 disabled:opacity-50">
              {saving ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ClipboardListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>
    </svg>
  )
}
