'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn, formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Loader2, Save, Plane,
  Wrench, Package, ExternalLink, ChevronDown, FileText,
  Receipt, Sparkles, MessageSquare, BookOpen,
} from 'lucide-react'
import { WoChatTimeline } from '@/components/work-orders/wo-chat-timeline'
import { AIPlanDrawer } from '@/components/work-orders/ai-plan-drawer'
import type { WorkOrder, WorkOrderLine, WorkOrderLineType, WorkOrderStatus } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workOrder: WorkOrder
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  userRole: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkOrderDetailClient({ workOrder, aircraft, userRole }: Props) {
  const router = useTenantRouter()
  const [wo, setWo] = useState(workOrder)
  const [lines, setLines] = useState<WorkOrderLine[]>((workOrder.lines as WorkOrderLine[]) ?? [])
  const [saving, setSaving] = useState(false)
  const [addingLine, setAddingLine] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAIPlan, setShowAIPlan] = useState(false)

  // Editable fields
  const [complaint, setComplaint] = useState(workOrder.customer_complaint ?? '')
  const [discrepancy, setDiscrepancy] = useState(workOrder.discrepancy ?? '')
  const [troubleshootingNotes, setTroubleshootingNotes] = useState(workOrder.troubleshooting_notes ?? '')
  const [findings, setFindings] = useState(workOrder.findings ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(workOrder.corrective_action ?? '')
  const [internalNotes, setInternalNotes] = useState(workOrder.internal_notes ?? '')
  const [customerNotes, setCustomerNotes] = useState(workOrder.customer_notes ?? '')
  const [taxAmount, setTaxAmount] = useState(String(workOrder.tax_amount ?? 0))
  const [dirty, setDirty] = useState(false)

  // New line form state
  const [newLine, setNewLine] = useState<{
    line_type: WorkOrderLineType
    description: string
    quantity: string
    unit_price: string
    part_number: string
    hours: string
    rate: string
    notes: string
  }>({
    line_type: 'labor',
    description: '',
    quantity: '1',
    unit_price: '0',
    part_number: '',
    hours: '',
    rate: '',
    notes: '',
  })

  function markDirty() { setDirty(true) }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint,
          discrepancy,
          troubleshooting_notes: troubleshootingNotes,
          findings,
          corrective_action: correctiveAction,
          internal_notes: internalNotes,
          customer_visible_notes: customerNotes,
          tax_amount: parseFloat(taxAmount) || 0,
        }),
      })
      const data = await res.json()
      setWo(prev => ({ ...prev, ...data }))
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(newStatus: WorkOrderStatus) {
    const res = await fetch(`/api/work-orders/${wo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const data = await res.json()
    setWo(prev => ({ ...prev, status: data.status, closed_at: data.closed_at }))
    router.refresh()
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault()
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
          notes: newLine.notes || null,
        }),
      })
      const data = await res.json()
      setLines(prev => [...prev, data])
      // Refresh totals
      const woRes = await fetch(`/api/work-orders/${wo.id}`)
      const woData = await woRes.json()
      setWo(prev => ({
        ...prev,
        labor_total: woData.labor_total,
        parts_total: woData.parts_total,
        outside_services_total: woData.outside_services_total,
        total: woData.total,
      }))
      setNewLine({ line_type: 'labor', description: '', quantity: '1', unit_price: '0', part_number: '', hours: '', rate: '', notes: '' })
      setShowAddLine(false)
    } finally {
      setAddingLine(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    if (!confirm('Remove this line item?')) return
    await fetch(`/api/work-orders/${wo.id}/lines/${lineId}`, { method: 'DELETE' })
    setLines(prev => prev.filter(l => l.id !== lineId))
    const woRes = await fetch(`/api/work-orders/${wo.id}`)
    const woData = await woRes.json()
    setWo(prev => ({
      ...prev,
      labor_total: woData.labor_total,
      parts_total: woData.parts_total,
      outside_services_total: woData.outside_services_total,
      total: woData.total,
    }))
  }

  async function handleAcceptPlan(planLines: any[]) {
    for (const line of planLines) {
      await fetch(`/api/work-orders/${wo.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(line),
      })
    }
    // Reload to pick up new lines and recalculated totals
    router.refresh()
    window.location.reload()
  }

  const isReadonly = ['closed', 'invoiced', 'paid', 'archived'].includes(wo.status)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono text-foreground">{wo.work_order_number}</h1>
              <span className={cn(
                'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft
              )}>
                {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
              </span>
            </div>
            {(wo as any).aircraft && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" />
                {(wo as any).aircraft.tail_number} — {(wo as any).aircraft.make} {(wo as any).aircraft.model}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Status selector */}
            <div className="relative">
              <select
                value={wo.status}
                onChange={e => handleStatusChange(e.target.value as WorkOrderStatus)}
                className="h-9 pl-3 pr-8 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
              >
                {(Object.entries(STATUS_LABEL) as [WorkOrderStatus, string][]).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Main fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Customer Complaint</Label>
            <textarea
              value={complaint}
              onChange={e => { setComplaint(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Describe the customer's complaint or reported issue…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Discrepancy</Label>
            <textarea
              value={discrepancy}
              onChange={e => { setDiscrepancy(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Describe the discrepancy found during inspection…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Troubleshooting Notes</Label>
            <textarea
              value={troubleshootingNotes}
              onChange={e => { setTroubleshootingNotes(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Troubleshooting steps taken…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Findings</Label>
            <textarea
              value={findings}
              onChange={e => { setFindings(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Findings from inspection or troubleshooting…"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Corrective Action</Label>
            <textarea
              value={correctiveAction}
              onChange={e => { setCorrectiveAction(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Corrective action taken to resolve the discrepancy…"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Line Items</h2>
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
                        type="number"
                        min="0"
                        step="0.25"
                        value={newLine.hours}
                        onChange={e => setNewLine(v => ({ ...v, hours: e.target.value }))}
                        placeholder="0.0"
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rate ($/hr)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newLine.rate}
                        onChange={e => setNewLine(v => ({ ...v, rate: e.target.value }))}
                        placeholder="0.00"
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={newLine.quantity}
                        onChange={e => setNewLine(v => ({ ...v, quantity: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
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
                        type="number"
                        min="0"
                        step="1"
                        value={newLine.quantity}
                        onChange={e => setNewLine(v => ({ ...v, quantity: e.target.value }))}
                        className="mt-1 h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unit Price</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
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
                          placeholder="P/N"
                          className="mt-1 h-8 text-xs"
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
              No line items yet. Add labor, parts, or outside services.
            </p>
          ) : lines.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Qty</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Unit</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Total</th>
                    {!isReadonly && <th className="px-3 py-2 w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {lines.map(line => (
                    <tr key={line.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {LINE_TYPE_ICON[line.line_type]}
                          {LINE_TYPE_LABEL[line.line_type]}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-xs">
                        <p className="font-medium text-foreground truncate">{line.description}</p>
                        {line.part_number && (
                          <p className="text-muted-foreground font-mono mt-0.5">P/N: {line.part_number}</p>
                        )}
                        {line.notes && (
                          <p className="text-muted-foreground mt-0.5 italic truncate">{line.notes}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{line.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">${(line.unit_price ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">${(line.line_total ?? 0).toFixed(2)}</td>
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

          {/* Totals */}
          {lines.length > 0 && (
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outside Services</span>
                  <span className="tabular-nums">${(wo.outside_services_total ?? 0).toFixed(2)}</span>
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
          )}
        </div>

        {/* Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <textarea
              value={internalNotes}
              onChange={e => { setInternalNotes(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Internal notes (not visible to customer)…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Customer-Visible Notes</Label>
            <textarea
              value={customerNotes}
              onChange={e => { setCustomerNotes(e.target.value); markDirty() }}
              readOnly={isReadonly}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Notes visible on customer copy…"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {!isReadonly && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAIPlan(true)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                AI Work Plan
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const res = await fetch('/api/invoices', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ work_order_id: wo.id }),
                })
                const data = await res.json()
                if (data.id) {
                  window.location.href = `/invoices/${data.id}`
                } else {
                  toast.error(data.error ?? 'Failed to generate invoice')
                }
              }}
            >
              <Receipt className="h-3.5 w-3.5 mr-1" />
              Generate Invoice
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const el = document.getElementById('wo-chat-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              Activity Log
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={`/parts?work_order_id=${wo.id}&aircraft_id=${(wo as any).aircraft?.id ?? ''}`}>
                <Package className="h-3.5 w-3.5 mr-1" />
                Find Parts
              </a>
            </Button>
            {(['completed', 'closed', 'invoiced', 'paid'].includes(wo.status)) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/maintenance/new?work_order_id=${wo.id}`)}
              >
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                Create Logbook Entry
              </Button>
            )}
          </div>
        </div>

        {/* Chat Timeline Section */}
        <div id="wo-chat-section" className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Activity & Messages
            </h2>
          </div>
          <WoChatTimeline
            workOrderId={wo.id}
            className="h-[400px]"
          />
        </div>

        {/* Metadata footer */}
        <div className="text-xs text-muted-foreground flex flex-wrap gap-4 pt-2 border-t border-border">
          <span>Opened: {formatDate(wo.opened_at)}</span>
          {wo.closed_at && <span>Closed: {formatDate(wo.closed_at)}</span>}
          <span>Updated: {formatDate(wo.updated_at)}</span>
        </div>

        {/* Sticky save bar */}
        {dirty && (
          <div className="fixed bottom-6 right-6 z-40">
            <Button onClick={handleSave} disabled={saving} className="shadow-lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* AI Plan Drawer */}
      <AIPlanDrawer
        workOrderId={wo.id}
        open={showAIPlan}
        onClose={() => setShowAIPlan(false)}
        onAcceptPlan={handleAcceptPlan}
      />
    </div>
  )
}
