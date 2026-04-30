'use client'

/**
 * Work Order detail — tabbed layout (Activity / Checklist / Line Items /
 * Media / AI Summary / Owner View / AD-SB / Logbook / Invoice).
 *
 * Activity is the iMessage-style WoChatTimeline (Camera / Mic / Paperclip /
 * Add Part / Add Labor toolbar lives there). Checklist reads
 * /api/work-orders/[id]/checklist — items default to the org's mechanic
 * setting template, and an AI-generated set is appended for any work order
 * that doesn't match a template. AD/SB is the per-aircraft ADSBManagerPanel
 * with an "Add to WO" button on every overdue / unknown row.
 */

import { useEffect, useState } from 'react'
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
  ClipboardCheck, Layers, Camera, Bot, Eye, ShieldCheck,
  CheckCircle2, Circle,
} from 'lucide-react'
import { WoChatTimeline } from '@/components/work-orders/wo-chat-timeline'
import { AIPlanDrawer } from '@/components/work-orders/ai-plan-drawer'
import { ADSBManagerPanel } from '@/components/aircraft/ad-sb-manager'
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

// ─── Tab definitions ─────────────────────────────────────────────────────────

type TabId =
  | 'activity'
  | 'checklist'
  | 'lineitems'
  | 'media'
  | 'aisummary'
  | 'ownerview'
  | 'adsb'
  | 'logbook'
  | 'invoice'

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'activity', label: 'Activity', icon: MessageSquare },
  { id: 'checklist', label: 'Checklist', icon: ClipboardCheck },
  { id: 'lineitems', label: 'Line Items', icon: Layers },
  { id: 'media', label: 'Media', icon: Camera },
  { id: 'aisummary', label: 'AI Summary', icon: Bot },
  { id: 'ownerview', label: 'Owner View', icon: Eye },
  { id: 'adsb', label: 'AD / SB', icon: ShieldCheck },
  { id: 'logbook', label: 'Logbook', icon: BookOpen },
  { id: 'invoice', label: 'Invoice', icon: Receipt },
]

// ─── Checklist row type ──────────────────────────────────────────────────────

interface ChecklistItem {
  id: string
  template_key: string | null
  template_label: string | null
  section: string | null
  item_key: string | null
  item_label: string
  item_description: string | null
  source: string
  source_reference: string | null
  required: boolean
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  sort_order: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workOrder: WorkOrder
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  userRole: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkOrderDetailClient({ workOrder, aircraft: _aircraft, userRole }: Props) {
  const router = useTenantRouter()
  const [wo, setWo] = useState(workOrder)
  const [lines, setLines] = useState<WorkOrderLine[]>((workOrder.lines as WorkOrderLine[]) ?? [])
  const [saving, setSaving] = useState(false)
  const [approvalLoading, setApprovalLoading] = useState<null | 'approve' | 'reject'>(null)
  const [addingLine, setAddingLine] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAIPlan, setShowAIPlan] = useState(false)
  const [tab, setTab] = useState<TabId>('activity')

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

  // Checklist state
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistTogglingId, setChecklistTogglingId] = useState<string | null>(null)

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

  const isOwnerView = userRole === 'owner'
  const isApprovalViewer = userRole === 'owner' || userRole === 'admin'
  const canRespondToApproval = isApprovalViewer && wo.status === 'awaiting_approval'
  const isReadonly = isOwnerView || ['closed', 'invoiced', 'paid', 'archived'].includes(wo.status)
  const aircraftId = (wo as any).aircraft?.id ?? wo.aircraft_id ?? null
  const woTotal =
    (wo.labor_total ?? 0) +
    (wo.parts_total ?? 0) +
    (wo.outside_services_total ?? 0) +
    (parseFloat(taxAmount) || 0)

  // ─── Load checklist whenever the Checklist tab opens for the first time ────
  useEffect(() => {
    if (tab !== 'checklist' || checklist.length > 0 || checklistLoading) return
    let cancelled = false
    void (async () => {
      setChecklistLoading(true)
      try {
        const res = await fetch(`/api/work-orders/${wo.id}/checklist`)
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setChecklist(Array.isArray(json.items) ? json.items : [])
      } finally {
        if (!cancelled) setChecklistLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleToggleChecklist(item: ChecklistItem) {
    setChecklistTogglingId(item.id)
    const next = !item.completed
    // Optimistic
    setChecklist((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, completed: next } : it)),
    )
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: next }),
      })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      // Roll back
      setChecklist((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, completed: !next } : it)),
      )
      toast.error('Could not update checklist item')
    } finally {
      setChecklistTogglingId(null)
    }
  }

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
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to save work order')
        return
      }
      setWo((prev) => ({ ...prev, ...data }))
      setDirty(false)
      toast.success('Saved')
    } catch {
      toast.error('Failed to save work order')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(newStatus: WorkOrderStatus) {
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to change status')
        return
      }
      setWo((prev) => ({ ...prev, status: data.status, closed_at: data.closed_at }))
      router.refresh()
    } catch {
      toast.error('Failed to change status')
    }
  }

  async function handleApproval(action: 'approve' | 'reject') {
    setApprovalLoading(action)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to update work order')
        return
      }
      if (data.work_order) setWo((prev) => ({ ...prev, ...data.work_order }))
      toast.success(action === 'approve' ? 'Work order approved' : 'Work order sent back to the shop')
      router.refresh()
    } catch {
      toast.error('Failed to update work order')
    } finally {
      setApprovalLoading(null)
    }
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
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add line item')
        return
      }
      setLines((prev) => [...prev, data])
      const woRes = await fetch(`/api/work-orders/${wo.id}`)
      const woData = await woRes.json().catch(() => ({}))
      if (woRes.ok) {
        setWo((prev) => ({
          ...prev,
          labor_total: woData.labor_total,
          parts_total: woData.parts_total,
          outside_services_total: woData.outside_services_total,
          total: woData.total,
        }))
      }
      setNewLine({ line_type: 'labor', description: '', quantity: '1', unit_price: '0', part_number: '', hours: '', rate: '', notes: '' })
      setShowAddLine(false)
    } catch {
      toast.error('Failed to add line item')
    } finally {
      setAddingLine(false)
    }
  }

  async function handleDeleteLine(lineId: string) {
    if (!confirm('Remove this line item?')) return
    await fetch(`/api/work-orders/${wo.id}/lines/${lineId}`, { method: 'DELETE' })
    setLines((prev) => prev.filter((l) => l.id !== lineId))
    const woRes = await fetch(`/api/work-orders/${wo.id}`)
    const woData = await woRes.json()
    setWo((prev) => ({
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
    router.refresh()
    window.location.reload()
  }

  async function handleGenerateInvoice() {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ work_order_id: wo.id }),
    })
    const data = await res.json()
    if (data.id) router.push(`/invoices/${data.id}`)
    else toast.error(data.error ?? 'Failed to generate invoice')
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* ── Header (always visible above the tabs) ── */}
      <div className="bg-white border-b border-border">
        <div className="px-6 pt-4 pb-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono text-foreground">{wo.work_order_number}</h1>
              <span
                className={cn(
                  'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
                  STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft,
                )}
              >
                {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
              </span>
              <div className="relative">
                <select
                  value={wo.status}
                  onChange={(e) => handleStatusChange(e.target.value as WorkOrderStatus)}
                  disabled={isOwnerView}
                  className="h-8 pl-2.5 pr-7 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none"
                >
                  {(Object.entries(STATUS_LABEL) as [WorkOrderStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {(wo as any).aircraft && (
              <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Plane className="h-3.5 w-3.5" />
                {(wo as any).aircraft.tail_number} — {(wo as any).aircraft.make} {(wo as any).aircraft.model}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isReadonly && (
              <Button size="sm" variant="outline" onClick={() => setShowAIPlan(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Plan
              </Button>
            )}
            {!isOwnerView && (
              <Button size="sm" variant="outline" onClick={handleGenerateInvoice}>
                <Receipt className="h-3.5 w-3.5 mr-1" /> Invoice
              </Button>
            )}
            {dirty && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            )}
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-0.5 px-4 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 px-3 py-2 -mb-px text-xs font-medium border-b-2 transition-colors',
                  active
                    ? 'text-foreground border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Approval banner — always visible above tab content when needed */}
      {canRespondToApproval && (
        <div className="mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="text-sm font-semibold text-amber-900 mb-1">Owner approval required</h2>
          <p className="text-sm text-amber-800">
            Review the scope below. Approving releases the work order to the shop. Rejecting returns it to the mechanic for changes.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => handleApproval('reject')} disabled={approvalLoading !== null}>
              {approvalLoading === 'reject' ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rejecting…</>) : ('Reject')}
            </Button>
            <Button size="sm" onClick={() => handleApproval('approve')} disabled={approvalLoading !== null}>
              {approvalLoading === 'approve' ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Approving…</>) : ('Approve Work Order')}
            </Button>
          </div>
        </div>
      )}

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Activity — iMessage-style chat with Camera/Mic/Paperclip/Add Part/Add Labor */}
        {tab === 'activity' && (
          <div className="h-full">
            <WoChatTimeline
              workOrderId={wo.id}
              className="h-full"
              onAddPart={() => setTab('lineitems')}
              onAddLabor={() => setTab('lineitems')}
            />
          </div>
        )}

        {/* Checklist — template-driven, AI-augmented, mechanic-toggleable */}
        {tab === 'checklist' && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Checklist</h2>
                <p className="text-xs text-muted-foreground">
                  Driven by your shop&rsquo;s checklist template (Settings → Shop). AI fills in any gaps automatically based on this work order&rsquo;s scope.
                </p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {checklist.filter((i) => i.completed).length} / {checklist.length} done
              </span>
            </div>

            {checklistLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading checklist…
              </div>
            )}

            {!checklistLoading && checklist.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                No checklist items yet. AD/SB items added from the AD/SB tab will land here.
              </div>
            )}

            {checklist.length > 0 && (
              <div className="space-y-2">
                {(() => {
                  // Group by section
                  const bySection = new Map<string, ChecklistItem[]>()
                  for (const item of checklist) {
                    const key = item.section ?? 'General'
                    if (!bySection.has(key)) bySection.set(key, [])
                    bySection.get(key)!.push(item)
                  }
                  return Array.from(bySection.entries()).map(([section, items]) => (
                    <div key={section} className="rounded-xl border border-border bg-white overflow-hidden">
                      <div className="px-4 py-2 bg-muted/30 border-b border-border text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {section}
                      </div>
                      <ul className="divide-y divide-border">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 p-3 hover:bg-muted/20 transition-colors">
                            <button
                              onClick={() => handleToggleChecklist(item)}
                              disabled={isReadonly || checklistTogglingId === item.id}
                              className="mt-0.5 shrink-0 disabled:opacity-50"
                              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                            >
                              {item.completed ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                              ) : (
                                <Circle className="h-5 w-5 text-muted-foreground" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn('text-sm', item.completed && 'line-through text-muted-foreground')}>
                                  {item.item_label}
                                </span>
                                {item.required && (
                                  <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                                    Required
                                  </span>
                                )}
                                {item.source === 'ad' && (
                                  <span className="text-[10px] uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">
                                    AD/SB
                                  </span>
                                )}
                                {item.source === 'ai' && (
                                  <span className="text-[10px] uppercase tracking-wide bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded font-semibold">
                                    AI
                                  </span>
                                )}
                              </div>
                              {item.item_description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{item.item_description}</p>
                              )}
                              {item.source_reference && (
                                <p className="text-[11px] text-muted-foreground/80 mt-0.5 font-mono">
                                  Ref: {item.source_reference}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>
        )}

        {/* Line Items */}
        {tab === 'lineitems' && (
          <div className="p-6 max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Line Items</h2>
              {!isReadonly && (
                <Button size="sm" variant="outline" onClick={() => setShowAddLine((v) => !v)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
                </Button>
              )}
            </div>

            {showAddLine && (
              <form onSubmit={handleAddLine} className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <select
                      value={newLine.line_type}
                      onChange={(e) => setNewLine((v) => ({ ...v, line_type: e.target.value as WorkOrderLineType }))}
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
                      onChange={(e) => setNewLine((v) => ({ ...v, description: e.target.value }))}
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
                        <Input type="number" min="0" step="0.25" value={newLine.hours} onChange={(e) => setNewLine((v) => ({ ...v, hours: e.target.value }))} placeholder="0.0" className="mt-1 h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Rate ($/hr)</Label>
                        <Input type="number" min="0" step="0.01" value={newLine.rate} onChange={(e) => setNewLine((v) => ({ ...v, rate: e.target.value }))} placeholder="0.00" className="mt-1 h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input type="number" min="0" step="0.25" value={newLine.quantity} onChange={(e) => setNewLine((v) => ({ ...v, quantity: e.target.value }))} className="mt-1 h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Price</Label>
                        <Input type="number" min="0" step="0.01" value={newLine.unit_price} onChange={(e) => setNewLine((v) => ({ ...v, unit_price: e.target.value }))} className="mt-1 h-8 text-xs" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input type="number" min="0" step="1" value={newLine.quantity} onChange={(e) => setNewLine((v) => ({ ...v, quantity: e.target.value }))} className="mt-1 h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Unit Price</Label>
                        <Input type="number" min="0" step="0.01" value={newLine.unit_price} onChange={(e) => setNewLine((v) => ({ ...v, unit_price: e.target.value }))} className="mt-1 h-8 text-xs" />
                      </div>
                      {newLine.line_type === 'part' && (
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Part Number</Label>
                          <Input value={newLine.part_number} onChange={(e) => setNewLine((v) => ({ ...v, part_number: e.target.value }))} placeholder="P/N" className="mt-1 h-8 text-xs" />
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

            {lines.length === 0 && !showAddLine ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                No line items yet. Add labor, parts, or outside services.
              </p>
            ) : lines.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden bg-white">
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
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
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

            {lines.length > 0 && (
              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm bg-white rounded-lg border border-border p-4">
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
                        onChange={(e) => { setTaxAmount(e.target.value); markDirty() }}
                        readOnly={isReadonly}
                        className="w-20 h-6 px-1 text-right text-xs rounded border border-input bg-background tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">${woTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {!isOwnerView && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Discrepancy</Label>
                  <textarea value={discrepancy} onChange={(e) => { setDiscrepancy(e.target.value); markDirty() }} readOnly={isReadonly} rows={3} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Describe the discrepancy found during inspection…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Findings</Label>
                  <textarea value={findings} onChange={(e) => { setFindings(e.target.value); markDirty() }} readOnly={isReadonly} rows={3} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Findings from inspection or troubleshooting…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Troubleshooting Notes</Label>
                  <textarea value={troubleshootingNotes} onChange={(e) => { setTroubleshootingNotes(e.target.value); markDirty() }} readOnly={isReadonly} rows={3} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Steps taken…" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Corrective Action</Label>
                  <textarea value={correctiveAction} onChange={(e) => { setCorrectiveAction(e.target.value); markDirty() }} readOnly={isReadonly} rows={3} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Corrective action taken to resolve the discrepancy…" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Media — surfaced from chat thread */}
        {tab === 'media' && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-white p-6 text-center text-sm text-muted-foreground">
              <Camera className="h-6 w-6 mx-auto mb-2 opacity-40" />
              Photos and videos uploaded from the Activity tab&rsquo;s 📎 button appear here.
              <br />
              <button
                onClick={() => setTab('activity')}
                className="text-primary hover:underline mt-2 inline-block"
              >
                Open Activity →
              </button>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {tab === 'aisummary' && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="h-4 w-4 text-violet-600" />
                <h2 className="text-base font-semibold text-foreground">AI Summary &amp; Plan</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Generate a structured work plan from the complaint &amp; aircraft history. Approve to land the proposed labor / parts as line items.
              </p>
              <Button onClick={() => setShowAIPlan(true)} disabled={isReadonly}>
                <Sparkles className="h-4 w-4 mr-1.5" /> Generate AI Work Plan
              </Button>
            </div>

            {!isOwnerView && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Customer Complaint</Label>
                  <textarea value={complaint} onChange={(e) => { setComplaint(e.target.value); markDirty() }} readOnly={isReadonly} rows={4} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Internal Notes</Label>
                  <textarea value={internalNotes} onChange={(e) => { setInternalNotes(e.target.value); markDirty() }} readOnly={isReadonly} rows={4} className="w-full px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Owner View */}
        {tab === 'ownerview' && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="rounded-xl border border-border bg-white p-5 space-y-4">
              <h2 className="text-base font-semibold text-foreground">What the owner sees</h2>
              <div>
                <Label className="text-xs">Reported Scope</Label>
                <textarea value={complaint} readOnly rows={3} className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-muted/20 text-sm resize-none" />
              </div>
              <div>
                <Label className="text-xs">Shop Notes (customer-visible)</Label>
                <textarea
                  value={customerNotes}
                  onChange={(e) => { setCustomerNotes(e.target.value); markDirty() }}
                  readOnly={isReadonly || isOwnerView}
                  rows={4}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-input bg-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="What you want the customer to see in the owner portal & invoice."
                />
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-3">
                Only the fields above + line items marked customer-visible reach the owner portal.
              </div>
            </div>
          </div>
        )}

        {/* AD / SB — per-aircraft, with Add to WO buttons */}
        {tab === 'adsb' && (
          <div className="p-6 max-w-5xl mx-auto">
            {aircraftId ? (
              <ADSBManagerPanel
                aircraftId={aircraftId}
                activeWorkOrderId={wo.id}
                onChecklistChanged={() => {
                  // Force checklist reload next time the user opens that tab
                  setChecklist([])
                }}
              />
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                Link an aircraft to this work order to manage AD / SB compliance.
              </div>
            )}
          </div>
        )}

        {/* Logbook */}
        {tab === 'logbook' && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-amber-700" />
                <h2 className="text-base font-semibold text-foreground">Logbook Entry</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Generate the maintenance logbook entry for this work order. AI drafts the corrective-action language from the line items and findings; you review &amp; sign.
              </p>
              <Button
                onClick={() => router.push(`/maintenance/new?work_order_id=${wo.id}`)}
                disabled={!['ready_for_signoff', 'closed', 'invoiced', 'paid', 'completed'].includes(wo.status)}
              >
                <BookOpen className="h-4 w-4 mr-1.5" /> Open Logbook Drafter
              </Button>
              {!['ready_for_signoff', 'closed', 'invoiced', 'paid', 'completed'].includes(wo.status) && (
                <p className="text-xs text-muted-foreground mt-2">
                  Available once the work order is ready for sign-off or closed.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Invoice */}
        {tab === 'invoice' && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Receipt className="h-4 w-4 text-emerald-600" />
                <h2 className="text-base font-semibold text-foreground">Invoice</h2>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Subtotal</div>
                  <div className="text-lg font-semibold tabular-nums">${(woTotal - (parseFloat(taxAmount) || 0)).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Tax</div>
                  <div className="text-lg font-semibold tabular-nums">${(parseFloat(taxAmount) || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Total</div>
                  <div className="text-lg font-bold tabular-nums">${woTotal.toFixed(2)}</div>
                </div>
              </div>
              <Button onClick={handleGenerateInvoice} disabled={isOwnerView || lines.length === 0}>
                <Receipt className="h-4 w-4 mr-1.5" /> Generate Invoice from Line Items
              </Button>
              {lines.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Add line items first.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metadata footer */}
      <div className="bg-white border-t border-border px-6 py-2 text-xs text-muted-foreground flex flex-wrap gap-4">
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
