'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn, formatDate } from '@/lib/utils'
import {
  Plane, ClipboardList, Plus, Loader2, Save, Wrench, Package,
  ExternalLink, FileText, Receipt, Trash2, Mail, Printer, Link2,
  Sparkles, ChevronRight, Pencil, User, Calendar,
} from 'lucide-react'
import type { WorkOrderStatus, WorkOrderLineType, WorkOrderLine, WorkOrder } from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  awaiting_approval: 'Awaiting Approval',
  awaiting_parts: 'Awaiting Parts',
  in_progress: 'In Progress',
  waiting_on_customer: 'Waiting on Customer',
  ready_for_signoff: 'Ready for Sign-off',
  closed: 'Closed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  archived: 'Archived',
}

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  open: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_approval: 'bg-amber-50 text-amber-700 border-amber-200',
  awaiting_parts: 'bg-orange-50 text-orange-700 border-orange-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  waiting_on_customer: 'bg-amber-50 text-amber-700 border-amber-200',
  ready_for_signoff: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-green-50 text-green-700 border-green-200',
  invoiced: 'bg-violet-50 text-violet-700 border-violet-200',
  paid: 'bg-green-100 text-green-800 border-green-300',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
}

/** Pipeline statuses in display order for the detail header */
const PIPELINE_STATUSES: WorkOrderStatus[] = [
  'draft', 'open', 'in_progress', 'awaiting_parts', 'ready_for_signoff', 'closed',
]

const LINE_TYPE_LABEL: Record<WorkOrderLineType, string> = {
  labor: 'Labor',
  part: 'Part',
  outside_service: 'Outside Service',
  discrepancy: 'Discrepancy',
  note: 'Note',
}

const LINE_TYPE_ICON: Record<WorkOrderLineType, React.ReactNode> = {
  labor: <Wrench className="h-3.5 w-3.5" />,
  part: <Package className="h-3.5 w-3.5" />,
  outside_service: <ExternalLink className="h-3.5 w-3.5" />,
  discrepancy: <FileText className="h-3.5 w-3.5" />,
  note: <FileText className="h-3.5 w-3.5" />,
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface WorkOrdersSplitPanelProps {
  workOrders: any[]
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  stats: { open: number; in_progress: number; ready_for_signoff: number; total: number }
  userRole: string
  initialWorkOrderId?: string
}

// ─── NewWorkOrderInline ──────────────────────────────────────────────────────

function NewWorkOrderInline({
  aircraft,
  onCreated,
}: {
  aircraft: { id: string; tail_number: string }[]
  onCreated: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [aircraftId, setAircraftId] = useState('')
  const [complaint, setComplaint] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId || null,
          complaint: complaint || null,
          status: 'open',
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error || `Failed to create work order (${res.status})`)
        return
      }
      const data = await res.json()
      setOpen(false)
      setAircraftId('')
      setComplaint('')
      onCreated(data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => { setError(''); setOpen(true) }}>
        <Plus className="h-4 w-4 mr-1.5" />
        New Work Order
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold">New Work Order</h2>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleCreate} className="p-5 space-y-4">
          <div>
            <Label htmlFor="nwo-aircraft-sp">Aircraft</Label>
            <select
              id="nwo-aircraft-sp"
              value={aircraftId}
              onChange={e => setAircraftId(e.target.value)}
              className="w-full mt-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No aircraft</option>
              {aircraft.map(ac => (
                <option key={ac.id} value={ac.id}>{ac.tail_number}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="nwo-complaint-sp">Initial Complaint</Label>
            <Input
              id="nwo-complaint-sp"
              value={complaint}
              onChange={e => setComplaint(e.target.value)}
              placeholder="Brief description of the issue"
              className="mt-1"
            />
          </div>
          {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function WorkOrderDetail({
  workOrderId,
  aircraft,
  userRole,
}: {
  workOrderId: string
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  userRole: string
}) {
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [lines, setLines] = useState<WorkOrderLine[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')

  // Editable fields
  const [complaint, setComplaint] = useState('')
  const [discrepancy, setDiscrepancy] = useState('')
  const [findings, setFindings] = useState('')
  const [correctiveAction, setCorrectiveAction] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [taxAmount, setTaxAmount] = useState('0')

  // Add line state
  const [showAddLine, setShowAddLine] = useState(false)
  const [addingLine, setAddingLine] = useState(false)
  const [newLine, setNewLine] = useState({
    line_type: 'labor' as WorkOrderLineType,
    description: '',
    quantity: '1',
    unit_price: '0',
    part_number: '',
    hours: '',
    rate: '',
  })

  // Editing state
  const [isEditing, setIsEditing] = useState(false)

  const fetchWo = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}`)
      if (!res.ok) throw new Error('Failed to load work order')
      const data = await res.json()
      setWo(data)
      setLines(data.lines ?? [])
      setComplaint(data.customer_complaint ?? '')
      setDiscrepancy(data.discrepancy ?? '')
      setFindings(data.findings ?? '')
      setCorrectiveAction(data.corrective_action ?? '')
      setInternalNotes(data.internal_notes ?? '')
      setCustomerNotes(data.customer_notes ?? '')
      setTaxAmount(String(data.tax_amount ?? 0))
      setDirty(false)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [workOrderId])

  useEffect(() => {
    fetchWo()
  }, [fetchWo])

  function markDirty() { setDirty(true) }

  async function handleSave() {
    if (!wo) return
    setSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_complaint: complaint,
          discrepancy,
          findings,
          corrective_action: correctiveAction,
          internal_notes: internalNotes,
          customer_notes: customerNotes,
          tax_amount: parseFloat(taxAmount) || 0,
        }),
      })
      const data = await res.json()
      setWo(prev => prev ? { ...prev, ...data } : data)
      setDirty(false)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(newStatus: WorkOrderStatus) {
    if (!wo) return
    const res = await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json()
    setWo(prev => prev ? { ...prev, status: data.status, closed_at: data.closed_at } : prev)
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault()
    if (!wo) return
    setAddingLine(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_type: newLine.line_type,
          description: newLine.description,
          quantity: parseFloat(newLine.quantity) || 1,
          unit_price: parseFloat(newLine.unit_price) || 0,
          part_number: newLine.part_number || null,
          hours: newLine.hours ? parseFloat(newLine.hours) : null,
          rate: newLine.rate ? parseFloat(newLine.rate) : null,
        }),
      })
      const data = await res.json()
      setLines(prev => [...prev, data])
      // Refresh totals
      const woRes = await fetch(`/api/work-orders/${wo.id}`)
      const woData = await woRes.json()
      setWo(prev => prev ? {
        ...prev,
        labor_total: woData.labor_total,
        parts_total: woData.parts_total,
        outside_services_total: woData.outside_services_total,
        total: woData.total,
      } : prev)
      setNewLine({ line_type: 'labor', description: '', quantity: '1', unit_price: '0', part_number: '', hours: '', rate: '' })
      setShowAddLine(false)
    } finally {
      setAddingLine(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    if (!wo || !confirm('Remove this line item?')) return
    await fetch(`/api/work-orders/${wo.id}/lines/${lineId}`, { method: 'DELETE' })
    setLines(prev => prev.filter(l => l.id !== lineId))
    const woRes = await fetch(`/api/work-orders/${wo.id}`)
    const woData = await woRes.json()
    setWo(prev => prev ? {
      ...prev,
      labor_total: woData.labor_total,
      parts_total: woData.parts_total,
      outside_services_total: woData.outside_services_total,
      total: woData.total,
    } : prev)
  }

  async function handleGenerateInvoice() {
    if (!wo) return
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_order_id: wo.id }),
    })
    const data = await res.json()
    if (data.id) {
      window.open(`/invoices/${data.id}`, '_blank')
    } else {
      alert(data.error ?? 'Failed to generate invoice')
    }
  }

  function handleCopyLink() {
    if (!wo) return
    const url = `${window.location.origin}/work-orders/${wo.id}`
    navigator.clipboard.writeText(url)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !wo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-8">
        <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
          <ClipboardList className="h-6 w-6 text-red-400" />
        </div>
        <p className="text-sm font-medium text-foreground">Failed to load work order</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchWo} className="mt-2">
          Retry
        </Button>
      </div>
    )
  }

  const isReadonly = ['closed', 'invoiced', 'paid', 'archived'].includes(wo.status)
  const currentPipelineIndex = PIPELINE_STATUSES.indexOf(wo.status as WorkOrderStatus)

  return (
    <div className="overflow-y-auto h-full">
      <div className="p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono text-foreground">{wo.work_order_number}</h2>
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
              STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft
            )}>
              {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && !isReadonly && (
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Save
              </Button>
            )}
          </div>
        </div>

        {/* ── Status Pipeline ── */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PIPELINE_STATUSES.map((status, i) => {
            const isActive = wo.status === status
            const isPast = currentPipelineIndex > i
            return (
              <div key={status} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />}
                <button
                  onClick={() => !isReadonly && handleStatusChange(status)}
                  disabled={isReadonly}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
                    isActive
                      ? STATUS_COLOR[status]
                      : isPast
                        ? 'bg-muted/60 text-muted-foreground border-border'
                        : 'bg-transparent text-muted-foreground/60 border-border/50 hover:border-border hover:text-muted-foreground',
                    !isReadonly && 'cursor-pointer',
                    isReadonly && 'cursor-default'
                  )}
                >
                  {STATUS_LABEL[status]}
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Info Row ── */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {(wo as any).aircraft && (
            <span className="flex items-center gap-1.5">
              <Plane className="h-3.5 w-3.5" />
              {(wo as any).aircraft.tail_number} - {(wo as any).aircraft.make} {(wo as any).aircraft.model}
            </span>
          )}
          {(wo as any).customer && (
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              {(wo as any).customer.name ?? (wo as any).customer.email ?? 'Customer'}
            </span>
          )}
          {wo.assigned_mechanic_id && (
            <span className="flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Mechanic assigned
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Opened {formatDate(wo.opened_at)}
          </span>
        </div>

        {/* ── Editable Fields ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Customer Complaint
            </Label>
            <textarea
              value={complaint}
              onChange={e => { setComplaint(e.target.value); markDirty() }}
              readOnly={isReadonly && !isEditing}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Describe the customer's complaint..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Discrepancy
            </Label>
            <textarea
              value={discrepancy}
              onChange={e => { setDiscrepancy(e.target.value); markDirty() }}
              readOnly={isReadonly && !isEditing}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Describe the discrepancy found..."
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Corrective Action / Findings
            </Label>
            <textarea
              value={correctiveAction}
              onChange={e => { setCorrectiveAction(e.target.value); markDirty() }}
              readOnly={isReadonly && !isEditing}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Corrective action taken..."
            />
          </div>
        </div>

        {/* ── Line Items ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lines</h3>
            {!isReadonly && (
              <Button size="sm" variant="outline" onClick={() => setShowAddLine(v => !v)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Line
              </Button>
            )}
          </div>

          {/* Add line form */}
          {showAddLine && (
            <form onSubmit={handleAddLine} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Type</Label>
                  <select
                    value={newLine.line_type}
                    onChange={e => setNewLine(v => ({ ...v, line_type: e.target.value as WorkOrderLineType }))}
                    className="w-full mt-1 h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {(Object.entries(LINE_TYPE_LABEL) as [WorkOrderLineType, string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs">Description *</Label>
                  <Input
                    value={newLine.description}
                    onChange={e => setNewLine(v => ({ ...v, description: e.target.value }))}
                    placeholder="Description"
                    className="mt-1 h-8 text-xs"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {newLine.line_type === 'labor' ? (
                  <>
                    <div>
                      <Label className="text-xs">Hours</Label>
                      <Input
                        type="number" min="0" step="0.25"
                        value={newLine.hours}
                        onChange={e => setNewLine(v => ({ ...v, hours: e.target.value }))}
                        placeholder="0.0" className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rate ($/hr)</Label>
                      <Input
                        type="number" min="0" step="0.01"
                        value={newLine.rate}
                        onChange={e => setNewLine(v => ({ ...v, rate: e.target.value }))}
                        placeholder="0.00" className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number" min="0" step="0.25"
                        value={newLine.quantity}
                        onChange={e => setNewLine(v => ({ ...v, quantity: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        type="number" min="0" step="0.01"
                        value={newLine.unit_price}
                        onChange={e => setNewLine(v => ({ ...v, unit_price: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number" min="0" step="1"
                        value={newLine.quantity}
                        onChange={e => setNewLine(v => ({ ...v, quantity: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        type="number" min="0" step="0.01"
                        value={newLine.unit_price}
                        onChange={e => setNewLine(v => ({ ...v, unit_price: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    {newLine.line_type === 'part' && (
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Part Number</Label>
                        <Input
                          value={newLine.part_number}
                          onChange={e => setNewLine(v => ({ ...v, part_number: e.target.value }))}
                          placeholder="P/N" className="mt-1 h-8 text-xs"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAddLine(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={addingLine || !newLine.description}>
                  {addingLine ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </form>
          )}

          {/* Lines table */}
          {lines.length === 0 && !showAddLine ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
              No line items yet.
            </p>
          ) : lines.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Hours</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Rate</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                    {!isReadonly && <th className="px-3 py-2 w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {lines.map(line => (
                    <tr key={line.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 max-w-xs">
                        <p className="font-medium text-foreground truncate">{line.description}</p>
                        {line.part_number && (
                          <p className="text-muted-foreground font-mono mt-0.5">P/N: {line.part_number}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {LINE_TYPE_ICON[line.line_type]}
                          {LINE_TYPE_LABEL[line.line_type]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {line.hours != null ? line.hours.toFixed(1) : '-'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {line.rate != null ? `$${line.rate.toFixed(2)}` : `$${(line.unit_price ?? 0).toFixed(2)}`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                        ${(line.line_total ?? 0).toFixed(2)}
                      </td>
                      {!isReadonly && (
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleDeleteLine(line.id)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* ── Notes ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Internal Notes
            </Label>
            <textarea
              value={internalNotes}
              onChange={e => { setInternalNotes(e.target.value); markDirty() }}
              readOnly={isReadonly && !isEditing}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Internal notes (not visible to customer)..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Customer Notes
            </Label>
            <textarea
              value={customerNotes}
              onChange={e => { setCustomerNotes(e.target.value); markDirty() }}
              readOnly={isReadonly && !isEditing}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Notes visible on customer copy..."
            />
          </div>
        </div>

        {/* ── Totals ── */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Labor</span>
              <span className="tabular-nums">${(wo.labor_total ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parts</span>
              <span className="tabular-nums">${(wo.parts_total ?? 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Tax</span>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxAmount}
                  onChange={e => { setTaxAmount(e.target.value); markDirty() }}
                  className="w-20 h-6 px-1 text-right text-xs rounded border border-input bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                ${((wo.labor_total ?? 0) + (wo.parts_total ?? 0) + (wo.outside_services_total ?? 0) + (parseFloat(taxAmount) || 0)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* ── Action Bar ── */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href={`/maintenance/new?work_order=${wo.id}`}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Logbook Entry
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={handleGenerateInvoice}>
              <Receipt className="h-3.5 w-3.5 mr-1.5" />
              Generate Invoice
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/work-orders/${wo.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Export PDF
              </a>
            </Button>
            <Button size="sm" variant="outline">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Email Customer
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={handleCopyLink}>
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Share Link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Print
            </Button>
          </div>
        </div>

        {/* ── Metadata Footer ── */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-4 pt-2 border-t border-border">
          <span>Opened: {formatDate(wo.opened_at)}</span>
          {wo.closed_at && <span>Closed: {formatDate(wo.closed_at)}</span>}
          <span>Updated: {formatDate(wo.updated_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Split Panel ────────────────────────────────────────────────────────

export function WorkOrdersSplitPanel({
  workOrders,
  aircraft,
  stats,
  userRole,
  initialWorkOrderId,
}: WorkOrdersSplitPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialWorkOrderId ?? null)
  const [filterAircraft, setFilterAircraft] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const listRef = useRef<HTMLDivElement>(null)

  // Client-side filtering
  const filtered = workOrders.filter(wo => {
    if (filterAircraft && wo.aircraft?.id !== filterAircraft && wo.aircraft_id !== filterAircraft) return false
    if (filterStatus && wo.status !== filterStatus) return false
    return true
  })

  function handleCreated(id: string) {
    setSelectedId(id)
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Panel ── */}
      <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-border bg-background">

        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Work Orders</h2>
          <NewWorkOrderInline aircraft={aircraft} onCreated={handleCreated} />
        </div>

        {/* Stats row */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex gap-2">
            {[
              { label: 'Open', value: stats.open, color: 'text-blue-600 bg-blue-50' },
              { label: 'In Progress', value: stats.in_progress, color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Ready', value: stats.ready_for_signoff, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Total', value: stats.total, color: 'text-foreground bg-muted' },
            ].map(s => (
              <div
                key={s.label}
                className={cn('flex-1 rounded-lg px-2 py-1.5 text-center', s.color)}
              >
                <p className="text-base font-bold leading-none">{s.value}</p>
                <p className="text-[10px] mt-0.5 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-border flex gap-2">
          <select
            value={filterAircraft}
            onChange={e => setFilterAircraft(e.target.value)}
            className="flex-1 h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All aircraft</option>
            {aircraft.map(ac => (
              <option key={ac.id} value={ac.id}>{ac.tail_number}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All statuses</option>
            {(Object.entries(STATUS_LABEL) as [WorkOrderStatus, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {/* Scrollable list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-2">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No work orders found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {filterAircraft || filterStatus ? 'Try adjusting your filters.' : 'Create a new work order to get started.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(wo => {
                const isSelected = selectedId === wo.id
                return (
                  <button
                    key={wo.id}
                    onClick={() => setSelectedId(wo.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 transition-colors hover:bg-muted/40',
                      isSelected && 'bg-brand-50 border-l-2 border-l-brand-500',
                      !isSelected && 'border-l-2 border-l-transparent'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-semibold text-brand-600">
                            {wo.work_order_number}
                          </span>
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border leading-none',
                            STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft
                          )}>
                            {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
                          </span>
                        </div>
                        {wo.aircraft && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                            <Plane className="h-3 w-3" />
                            {wo.aircraft.tail_number}
                          </p>
                        )}
                        {wo.customer_complaint && (
                          <p className="text-xs text-foreground/80 truncate mb-1">
                            {wo.customer_complaint}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>{formatDate(wo.opened_at ?? wo.created_at)}</span>
                          <span className="tabular-nums font-medium">${(wo.total ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 mt-1 flex-shrink-0" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {selectedId ? (
          <WorkOrderDetail
            key={selectedId}
            workOrderId={selectedId}
            aircraft={aircraft}
            userRole={userRole}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <ClipboardList className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Select a work order</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Choose a work order from the list to view its details, edit fields, manage line items, and generate documents.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
