'use client'

/**
 * Work Order detail — redesign (v2).
 *
 * This is the DEFAULT work-order detail. The original is reachable at
 * ?ui=legacy (see lib/work-orders/ui-mode.ts — flip DEFAULT_WO_UI to revert).
 * Same data + endpoints as the original WorkOrderDetailClient — restructured
 * from 15 flat tabs into 5 intent groups (Summary / Work / Parts & costs /
 * Sign-off / Activity), a lifecycle header with a single next-action, a
 * persistent "Ready to close?" rail, and a "Preview as owner" toggle.
 *
 * Feature-parity pass: every real feature from the old detail is preserved —
 * troubleshooting notes, a valid-transition status menu, PDF download, AI Plan
 * (line-item proposer), full logbook flow (regenerate + RTS warnings/override +
 * AD/reference chips), the owner cost summary + "message mechanic", and the
 * floating voice / scan-part inputs. Fake/stub tabs (Media, Activity board,
 * checklist timer, disabled parts actions) are intentionally dropped.
 *
 * Audit fixes folded in: labor lines store quantity=hours, unit_price=rate so
 * the generated line_total reflects hours*rate (was $0); tax included in total.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Loader2, Plane, Receipt, Sparkles, MessageSquare, BookOpen,
  ClipboardCheck, FileText, CheckCircle2, Circle, Printer, Link2, Mail,
  PenLine, ArrowRight, ChevronLeft, ChevronDown, MoreHorizontal, ShieldCheck, Wrench, Eye, Lock, AlertCircle,
} from 'lucide-react'
import { ESignatureModal, SignatureBlock, type SignatureResult } from '@/components/work-orders/e-signature-modal'
import { WoChatTimeline } from '@/components/work-orders/wo-chat-timeline'
import { ADSBManagerPanel } from '@/components/aircraft/ad-sb-manager'
import { WoToolsPanel } from '@/components/work-orders/wo-tools-panel'
import { AIPlanDrawer } from '@/components/work-orders/ai-plan-drawer'
import { VoiceButton } from '@/components/voice/VoiceButton'
import { CameraButton } from '@/components/camera/CameraButton'
import { WO_LIFECYCLE, woStatusLabel, woStatusPill, woStatusDot } from './wo-status'
import { AssignMechanic } from './assign-mechanic'
import { woHref } from '@/lib/work-orders/ui-mode'
import { rtsIssueText, type RtsIssue } from '@/lib/work-orders/rts'
import type { WorkOrder, WorkOrderLine, WorkOrderLineType, WorkOrderStatus } from '@/types'

interface ChecklistItem {
  id: string
  section: string | null
  item_label: string
  item_description: string | null
  source: string
  required: boolean
  completed: boolean
  sort_order: number
}

interface SignerProfile {
  full_name?: string | null
  email?: string | null
  mechanic_cert_number?: string | null
  mechanic_cert_type?: string | null
}

interface Props {
  workOrder: WorkOrder
  aircraft: { id: string; tail_number: string; make: string; model: string }[]
  userRole: string
  /** Resolved persona ('owner' | 'shop' | 'admin'). Decides the read-only
   *  owner view — userRole is the ORG role (owner/admin/member) and must not
   *  be conflated with it: a shop user who owns the org is still the shop. */
  persona?: string
  profile?: SignerProfile | null
}

type V2Tab = 'summary' | 'work' | 'costs' | 'signoff' | 'activity'

const V2_TABS: { id: V2Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'work', label: 'Work', icon: ClipboardCheck },
  { id: 'costs', label: 'Parts & costs', icon: Receipt },
  { id: 'signoff', label: 'Sign-off', icon: PenLine },
  { id: 'activity', label: 'Activity', icon: MessageSquare },
]

const LIFECYCLE_STAGE: Record<string, number> = {
  draft: 0, open: 1,
  awaiting_approval: 2, awaiting_parts: 2, in_progress: 2, waiting_on_customer: 2,
  ready_for_signoff: 3, closed: 4, invoiced: 5, paid: 5, archived: 5,
}

// Valid status transitions — replaces the old free-form dropdown (which allowed
// illegal jumps). Covers the non-linear states (awaiting parts, waiting on
// customer, hold/archive, re-open) without re-introducing that bug.
const STATUS_TRANSITIONS: Record<string, WorkOrderStatus[]> = {
  draft: ['open', 'awaiting_approval', 'archived'],
  open: ['in_progress', 'awaiting_parts', 'awaiting_approval', 'archived'],
  awaiting_approval: ['open', 'in_progress'],
  awaiting_parts: ['in_progress', 'waiting_on_customer'],
  in_progress: ['awaiting_parts', 'waiting_on_customer', 'ready_for_signoff'],
  waiting_on_customer: ['in_progress'],
  ready_for_signoff: ['in_progress', 'closed'],
  closed: ['invoiced', 'in_progress'],
  invoiced: ['paid', 'closed'],
  paid: [],
  archived: ['draft'],
}

export function WorkOrderDetailClientV2({ workOrder, userRole, persona, profile }: Props) {
  const router = useTenantRouter()
  const [wo, setWo] = useState(workOrder)
  const [lines, setLines] = useState<WorkOrderLine[]>((workOrder.lines as WorkOrderLine[]) ?? [])
  const [tab, setTab] = useState<V2Tab>('summary')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [approvalLoading, setApprovalLoading] = useState<null | 'approve' | 'reject'>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [previewAsOwner, setPreviewAsOwner] = useState(false)
  const [showAIPlan, setShowAIPlan] = useState(false)

  // Editable fields
  const [complaint, setComplaint] = useState(workOrder.customer_complaint ?? (workOrder as any).complaint ?? '')
  const [discrepancy, setDiscrepancy] = useState(workOrder.discrepancy ?? '')
  const [troubleshooting, setTroubleshooting] = useState((workOrder as any).troubleshooting_notes ?? '')
  const [findings, setFindings] = useState(workOrder.findings ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(workOrder.corrective_action ?? '')
  const [internalNotes, setInternalNotes] = useState(workOrder.internal_notes ?? '')
  const [customerNotes, setCustomerNotes] = useState(workOrder.customer_notes ?? (workOrder as any).customer_visible_notes ?? '')
  const [taxAmount, setTaxAmount] = useState(String(workOrder.tax_amount ?? 0))

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Line add form
  const [showAddLine, setShowAddLine] = useState(false)
  const [addingLine, setAddingLine] = useState(false)
  const [newLine, setNewLine] = useState({
    line_type: 'labor' as WorkOrderLineType,
    description: '', quantity: '1', unit_price: '0', part_number: '', hours: '', rate: '',
  })

  // AI summary
  const [aiSummary, setAiSummary] = useState<string>(((wo as any).ai_summary as string) ?? '')
  const [aiSummaryGenerating, setAiSummaryGenerating] = useState(false)
  const [aiSummaryDirty, setAiSummaryDirty] = useState(false)

  // Logbook + sign + RTS + invoice
  const [logbookEntry, setLogbookEntry] = useState<any | null>(null)
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [logbookGenerating, setLogbookGenerating] = useState(false)
  const [logbookSaving, setLogbookSaving] = useState(false)
  const [logbookDraftBody, setLogbookDraftBody] = useState('')
  const [logbookDirty, setLogbookDirty] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [rtsOverride, setRtsOverride] = useState(false)
  const [rts, setRts] = useState<{ loading: boolean; ran: boolean; ok: boolean; blockers: Array<RtsIssue | string>; warnings: Array<RtsIssue | string> }>(
    { loading: false, ran: false, ok: false, blockers: [], warnings: [] },
  )

  // Persona decides the customer view; org role only adds approval rights.
  // Fall back to the old role check when persona isn't provided.
  const isActualOwner = (persona ?? userRole) === 'owner'
  const isOwnerView = isActualOwner || previewAsOwner
  const isApprovalViewer = isActualOwner || userRole === 'owner' || userRole === 'admin'
  const canRespondToApproval = isApprovalViewer && wo.status === 'awaiting_approval'
  const isReadonly = isOwnerView || ['closed', 'invoiced', 'paid', 'archived'].includes(wo.status)
  const aircraftId = (wo as any).aircraft?.id ?? wo.aircraft_id ?? null
  const aircraftTail = (wo as any).aircraft?.tail_number ?? 'Unassigned'
  const aircraftModel = [(wo as any).aircraft?.make, (wo as any).aircraft?.model].filter(Boolean).join(' ') || 'Aircraft'
  const workType = humanizeEnum((wo as any).service_type) ?? 'Maintenance'
  const dueDate = (wo as any).due_date ?? (wo as any).estimated_completion_date ?? null
  const deposit = Number((wo as any).deposit_amount ?? 0)

  const woTotal = (wo.labor_total ?? 0) + (wo.parts_total ?? 0) + (wo.outside_services_total ?? 0) + (parseFloat(taxAmount) || 0)
  const requiredChecklist = checklist.filter((i) => i.required)
  const incompleteRequired = requiredChecklist.filter((i) => !i.completed)
  const adSbItems = checklist.filter((i) => i.source === 'ad_sb' || i.source === 'ad')
  const adSbIncomplete = adSbItems.filter((i) => i.required && !i.completed)
  const lineItemCount = lines.filter((l) => !['note', 'discrepancy'].includes(l.line_type)).length
  const logbookReady = Boolean((wo as any).linked_logbook_entry_id || logbookEntry?.id)
  const invoiceReady = Boolean((wo as any).linked_invoice_id || ['invoiced', 'paid'].includes(wo.status))
  const aiReady = Boolean(aiSummary.trim())

  // Each gate links to the tab where it gets resolved — the rail doubles as
  // navigation, not just a status display.
  const gates: { id: string; label: string; detail: string; complete: boolean; tab: V2Tab }[] = [
    { id: 'checklist', label: 'Checklist', detail: requiredChecklist.length === 0 ? `${checklist.length} items` : `${requiredChecklist.length - incompleteRequired.length} of ${requiredChecklist.length}`, complete: requiredChecklist.length === 0 ? checklist.length > 0 : incompleteRequired.length === 0, tab: 'work' },
    { id: 'adsb', label: 'AD / SB reviewed', detail: adSbIncomplete.length ? `${adSbIncomplete.length} open` : 'Done', complete: adSbIncomplete.length === 0, tab: 'work' },
    { id: 'lines', label: 'Labor & parts', detail: lineItemCount ? `$${woTotal.toFixed(0)}` : 'None', complete: lineItemCount > 0, tab: 'costs' },
    { id: 'ai', label: 'AI summary reviewed', detail: aiReady ? 'Done' : '', complete: aiReady, tab: 'summary' },
    { id: 'logbook', label: 'Logbook signed', detail: logbookEntry?.status === 'signed' ? 'Signed' : logbookReady ? 'Drafted' : '', complete: logbookReady, tab: 'signoff' },
    { id: 'invoice', label: 'Invoice', detail: invoiceReady ? 'Done' : '', complete: invoiceReady, tab: 'costs' },
  ]
  const openGateCount = gates.filter((g) => !g.complete).length
  const gatesComplete = openGateCount === 0
  const currentStage = LIFECYCLE_STAGE[wo.status] ?? 0
  const allowedTransitions = STATUS_TRANSITIONS[wo.status] ?? []

  // Below lg the close-out rail collapses into an expandable bar above the body.
  const [gatesOpen, setGatesOpen] = useState(false)

  // ── Effects ───────────────────────────────────────────────────────────────
  // Each tab starts at the top — without this, switching tabs keeps the
  // previous tab's scroll position in the shared scroller.
  const scrollerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 })
  }, [tab])

  useEffect(() => {
    if (!['summary', 'work'].includes(tab) || checklist.length > 0 || checklistLoading) return
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
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    if (tab !== 'signoff') return
    let cancelled = false
    void (async () => {
      setLogbookLoading(true)
      try {
        const res = await fetch(`/api/logbook-entries?work_order_id=${wo.id}&limit=1`)
        if (!res.ok) return
        const json = await res.json()
        const entry = Array.isArray(json.entries) && json.entries.length ? json.entries[0]
          : Array.isArray(json) && json.length ? json[0] : null
        if (!cancelled) {
          setLogbookEntry(entry)
          setLogbookDraftBody(entry?.entry_text ?? entry?.description ?? '')
          setLogbookDirty(false)
        }
      } finally {
        if (!cancelled) setLogbookLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, wo.id])

  useEffect(() => {
    if (!logbookEntry || logbookEntry.status === 'signed' || logbookDirty) return
    let cancelled = false
    setRts((p) => ({ ...p, loading: true }))
    fetch(`/api/work-orders/${wo.id}/rts-check`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { ok?: boolean; blockers?: RtsIssue[]; warnings?: RtsIssue[] }) => {
        if (cancelled) return
        setRts({ loading: false, ran: true, ok: Boolean(data.ok), blockers: data.blockers ?? [], warnings: data.warnings ?? [] })
        setRtsOverride(false)
      })
      .catch(() => { if (!cancelled) setRts({ loading: false, ran: true, ok: true, blockers: [], warnings: ['Preflight check could not run.'] }) })
    return () => { cancelled = true }
  }, [logbookEntry, logbookDirty, wo.id])

  // ── Handlers ────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaint, discrepancy, troubleshooting_notes: troubleshooting, findings, corrective_action: correctiveAction, internal_notes: internalNotes, customer_visible_notes: customerNotes, tax_amount: parseFloat(taxAmount) || 0 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return }
      setWo((prev) => ({ ...prev, ...data }))
      setDirty(false)
      toast.success('Saved')
    } catch { toast.error('Failed to save') } finally { setSaving(false) }
  }

  async function handleStatusChange(newStatus: WorkOrderStatus) {
    setStatusOpen(false)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to change status'); return }
      setWo((prev) => ({ ...prev, status: data.status, closed_at: data.closed_at }))
      router.refresh()
    } catch { toast.error('Failed to change status') }
  }

  async function handleApproval(action: 'approve' | 'reject') {
    setApprovalLoading(action)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed'); return }
      if (data.work_order) setWo((prev) => ({ ...prev, ...data.work_order }))
      toast.success(action === 'approve' ? 'Work order approved' : 'Sent back to the shop')
      router.refresh()
    } catch { toast.error('Failed') } finally { setApprovalLoading(null) }
  }

  async function refreshTotals() {
    const woRes = await fetch(`/api/work-orders/${wo.id}`)
    const d = await woRes.json().catch(() => ({}))
    if (woRes.ok) setWo((prev) => ({ ...prev, labor_total: d.labor_total, parts_total: d.parts_total, outside_services_total: d.outside_services_total, total: d.total }))
  }

  async function handleAddLine(e: React.FormEvent) {
    e.preventDefault()
    setAddingLine(true)
    try {
      const isLabor = newLine.line_type === 'labor'
      const hours = parseFloat(newLine.hours) || 0
      const rate = parseFloat(newLine.rate) || 0
      const body = isLabor
        ? { line_type: 'labor', description: newLine.description, quantity: hours || 1, unit_price: rate, hours, rate }
        : { line_type: newLine.line_type, description: newLine.description, quantity: parseFloat(newLine.quantity) || 1, unit_price: parseFloat(newLine.unit_price) || 0, part_number: newLine.part_number || null }
      const res = await fetch(`/api/work-orders/${wo.id}/lines`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? 'Failed to add line'); return }
      setLines((prev) => [...prev, data])
      await refreshTotals()
      setNewLine({ line_type: 'labor', description: '', quantity: '1', unit_price: '0', part_number: '', hours: '', rate: '' })
      setShowAddLine(false)
    } catch { toast.error('Failed to add line') } finally { setAddingLine(false) }
  }

  async function handleDeleteLine(lineId: string) {
    if (!confirm('Remove this line item?')) return
    await fetch(`/api/work-orders/${wo.id}/lines/${lineId}`, { method: 'DELETE' })
    setLines((prev) => prev.filter((l) => l.id !== lineId))
    await refreshTotals()
  }

  // AI Plan — proposes line items; we append to state (no full page reload).
  async function handleAcceptPlan(planLines: any[]) {
    try {
      for (const line of planLines) {
        const res = await fetch(`/api/work-orders/${wo.id}/lines`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(line),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.id) setLines((prev) => [...prev, data])
      }
      await refreshTotals()
      toast.success('Added line items from AI plan')
    } catch { toast.error('Could not add all plan items') } finally { setShowAIPlan(false) }
  }

  async function handleToggleChecklist(item: ChecklistItem) {
    setTogglingId(item.id)
    const next = !item.completed
    setChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, completed: next } : it)))
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/checklist/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: next }),
      })
      if (!res.ok) throw new Error('toggle failed')
    } catch {
      setChecklist((prev) => prev.map((it) => (it.id === item.id ? { ...it, completed: !next } : it)))
      toast.error('Could not update item')
    } finally { setTogglingId(null) }
  }

  async function handleGenerateAiSummary() {
    setAiSummaryGenerating(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/ai-summary`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'AI summary failed'); return }
      setAiSummary(j.summary ?? '')
      setAiSummaryDirty(false)
      toast.success('AI summary generated')
    } catch { toast.error('AI summary failed') } finally { setAiSummaryGenerating(false) }
  }

  async function handleSaveAiSummary() {
    if (!aiSummaryDirty) return
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_summary: aiSummary }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error || 'Save failed'); return }
      setAiSummaryDirty(false)
      toast.success('Summary saved')
    } catch { toast.error('Save failed') }
  }

  async function handleGenerateLogbookEntry() {
    setLogbookGenerating(true)
    try {
      const aiRes = await fetch('/api/ai/generate-logbook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: (wo as any).aircraft_id, work_order_id: wo.id }),
      })
      const aiJson = await aiRes.json().catch(() => ({}))
      if (!aiRes.ok) { toast.error(aiJson?.error || 'AI logbook generation failed'); return }
      const entryRes = await fetch('/api/logbook-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: (wo as any).aircraft_id, work_order_id: wo.id, entry_type: aiJson.entry_type ?? 'maintenance', entry_date: new Date().toISOString().slice(0, 10), description: aiJson.description ?? '', parts_used: aiJson.parts_used ?? [], references_used: aiJson.references_used ?? [], ad_numbers: aiJson.ad_numbers ?? [], status: 'draft' }),
      })
      const entry = await entryRes.json().catch(() => ({}))
      if (!entryRes.ok) { toast.error(entry?.error || 'Failed to save logbook draft'); return }
      setLogbookEntry(entry)
      setLogbookDraftBody(entry.entry_text ?? entry.description ?? aiJson.description ?? '')
      setLogbookDirty(false)
      await fetch(`/api/work-orders/${wo.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linked_logbook_entry_id: entry.id }) }).catch(() => null)
      setWo((prev) => ({ ...prev, linked_logbook_entry_id: entry.id } as any))
      toast.success('Logbook draft generated — review and sign')
    } catch { toast.error('Logbook generation failed') } finally { setLogbookGenerating(false) }
  }

  async function handleSaveLogbookDraft() {
    if (!logbookEntry || !logbookDirty) return
    setLogbookSaving(true)
    try {
      const res = await fetch(`/api/logbook-entries/${logbookEntry.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: logbookDraftBody }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); toast.error(j?.error || 'Save failed'); return }
      setLogbookEntry(await res.json())
      setLogbookDirty(false)
      toast.success('Draft saved')
    } finally { setLogbookSaving(false) }
  }

  async function handleApplySignature(sig: SignatureResult) {
    if (!logbookEntry) return
    try {
      if (logbookDirty) await handleSaveLogbookDraft()
      const res = await fetch(`/api/logbook-entries/${logbookEntry.id}/sign`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mechanic_name: sig.signerName, mechanic_cert_number: sig.signerCert, cert_type: 'A&P', signature_audit: sig }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Sign failed'); return }
      setLogbookEntry(j)
      setShowSignatureModal(false)
      toast.success('Logbook entry signed and sealed')
    } catch { toast.error('Sign failed') }
  }

  async function handleGenerateInvoice() {
    setGeneratingInvoice(true)
    try {
      if (aiSummaryDirty) await handleSaveAiSummary()
      const res = await fetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ work_order_id: wo.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not generate invoice'); return }
      toast.success('Invoice generated')
      router.push(`/invoices/${j.id}`)
    } catch { toast.error('Could not generate invoice') } finally { setGeneratingInvoice(false) }
  }

  const primary = useMemo(() => {
    switch (wo.status) {
      case 'draft': return { label: 'Open work order', run: () => handleStatusChange('open') }
      case 'open': return { label: 'Start work', run: () => handleStatusChange('in_progress') }
      case 'in_progress': return { label: gatesComplete ? 'Go to sign-off' : 'Continue work', run: () => setTab(gatesComplete ? 'signoff' : 'work') }
      case 'awaiting_approval': return { label: 'Review approval', run: () => setTab('summary') }
      case 'awaiting_parts': return { label: 'Review parts', run: () => setTab('costs') }
      case 'waiting_on_customer': return { label: 'Open activity', run: () => setTab('activity') }
      case 'ready_for_signoff': return { label: 'IA review & sign', run: () => setTab('signoff') }
      default: return { label: 'Open invoice', run: () => setTab('costs') }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo.status, gatesComplete])

  function markField<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true) }
  }

  // Gate rows are buttons — each jumps to the tab where that gate gets
  // resolved. Shared between the lg rail and the small-screen close-out bar.
  const gateRows = (
    <div>
      {gates.map((g) => (
        <button
          key={g.id}
          onClick={() => { setTab(g.tab); setGatesOpen(false) }}
          className="w-full flex items-center gap-2.5 py-2 border-t border-border first:border-t-0 text-left group"
        >
          {g.complete ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
          <span className={cn('flex-1 text-[13px] group-hover:text-foreground transition-colors', g.complete ? 'text-foreground' : 'text-muted-foreground')}>{g.label}</span>
          {g.detail && <span className="text-[11px] text-muted-foreground">{g.detail}</span>}
          <ArrowRight className="h-3 w-3 text-transparent group-hover:text-muted-foreground/70 transition-colors shrink-0" />
        </button>
      ))}
    </div>
  )

  const closeCta = !isReadonly ? (
    <Button
      className="w-full"
      disabled={!gatesComplete}
      onClick={() => handleStatusChange(wo.status === 'ready_for_signoff' ? 'closed' : 'ready_for_signoff')}
    >
      {gatesComplete
        ? (wo.status === 'ready_for_signoff' ? 'Close work order' : 'Mark ready for sign-off')
        : <><Lock className="h-3.5 w-3.5 mr-1.5" /> {openGateCount} steps left</>}
    </Button>
  ) : null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
      {/* Header */}
      <div className="bg-background border-b border-border px-5 sm:px-6 pt-4 pb-3">
        <button onClick={() => router.push(woHref('/work-orders', 'v2'))} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground mb-2">
          <ChevronLeft className="h-3.5 w-3.5" /> Work orders
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-lg font-semibold text-foreground leading-none">{wo.work_order_number}</h1>

          {/* Status pill + valid-transition menu */}
          <div className="relative" onMouseLeave={() => setStatusOpen(false)}>
            <button
              onClick={() => !isOwnerView && allowedTransitions.length > 0 && setStatusOpen((o) => !o)}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', woStatusPill(wo.status), !isOwnerView && allowedTransitions.length > 0 && 'hover:opacity-80')}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', woStatusDot(wo.status))} />
              {woStatusLabel(wo.status)}
              {!isOwnerView && allowedTransitions.length > 0 && <ChevronDown className="h-3 w-3 opacity-60" />}
            </button>
            {statusOpen && (
              <div className="absolute left-0 mt-1 w-52 rounded-xl border border-border bg-background shadow-lg z-20 py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Change status to</div>
                {allowedTransitions.map((s) => (
                  <button key={s} onClick={() => handleStatusChange(s)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left">
                    <span className={cn('h-1.5 w-1.5 rounded-full', woStatusDot(s))} /> {woStatusLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            <Plane className="h-3.5 w-3.5" /> {aircraftTail} · {aircraftModel}
          </span>
          {!isOwnerView && (
            <AssignMechanic
              workOrderId={wo.id}
              value={(wo as any).assigned_mechanic_id ?? null}
              onChange={(id) => setWo((prev) => ({ ...prev, assigned_mechanic_id: id }) as typeof prev)}
            />
          )}
          <div className="flex-1" />

          {!isActualOwner && !previewAsOwner && (
            <button onClick={() => setPreviewAsOwner(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Eye className="h-3.5 w-3.5" /> Preview as owner
            </button>
          )}
          {previewAsOwner && (
            <button onClick={() => setPreviewAsOwner(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700">
              <Eye className="h-3.5 w-3.5" /> Exit owner preview
            </button>
          )}
          {!isOwnerView && (
            <Button size="sm" onClick={primary.run} className="h-8 rounded-lg px-3.5">
              {primary.label} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          )}
          <div className="relative" onMouseLeave={() => setShareOpen(false)}>
            <button onClick={() => setShareOpen((o) => !o)} aria-label="More actions" className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {shareOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-xl border border-border bg-background shadow-lg z-20 py-1 text-sm">
                <a href={`/api/work-orders/${wo.id}/pdf`} target="_blank" rel="noopener noreferrer" onClick={() => setShareOpen(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-muted"><FileText className="h-3.5 w-3.5" /> Download PDF</a>
                <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/work-orders/${wo.id}`); toast.success('Link copied'); setShareOpen(false) }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"><Link2 className="h-3.5 w-3.5" /> Copy link</button>
                <button onClick={() => { setShareOpen(false); setTimeout(() => window.print(), 50) }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"><Printer className="h-3.5 w-3.5" /> Print</button>
                <button onClick={() => { setShareOpen(false); window.location.href = `mailto:?subject=${encodeURIComponent('Work Order ' + wo.work_order_number)}&body=${encodeURIComponent(`${window.location.origin}/work-orders/${wo.id}`)}` }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"><Mail className="h-3.5 w-3.5" /> Email customer</button>
              </div>
            )}
          </div>
        </div>

        {/* Lifecycle rail — scrolls horizontally on small screens instead of
            wrapping mid-sequence. */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WO_LIFECYCLE.map((stage, i) => {
            const done = i < currentStage
            const current = i === currentStage
            return (
              <span key={stage.status} className="inline-flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="text-muted-foreground/40 text-xs">›</span>}
                <span className={cn('inline-flex items-center gap-1.5 text-[12px]', current ? 'text-foreground font-medium' : done ? 'text-muted-foreground' : 'text-muted-foreground/50')}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : current ? <span className="h-2 w-2 rounded-full bg-indigo-500" /> : <Circle className="h-3.5 w-3.5" />}
                  {stage.label}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {canRespondToApproval && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm text-amber-800">This work order is awaiting your approval.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!!approvalLoading} onClick={() => handleApproval('reject')}>Reject</Button>
            <Button size="sm" disabled={!!approvalLoading} onClick={() => handleApproval('approve')}>Approve</Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-background border-b border-border px-4 flex gap-1 overflow-x-auto">
        {V2_TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn('inline-flex items-center gap-2 px-3.5 py-2.5 text-[13px] border-b-2 transition-colors whitespace-nowrap', active ? 'border-indigo-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Close-out bar — stands in for the rail below lg, same gates. */}
        {tab !== 'activity' && (
          <div className="xl:hidden border-b border-border bg-background shrink-0">
            <button onClick={() => setGatesOpen((o) => !o)} aria-expanded={gatesOpen} className="w-full flex items-center gap-3 px-4 py-2">
              <span className="text-xs font-medium text-foreground shrink-0">Ready to close?</span>
              <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(((gates.length - openGateCount) / gates.length) * 100)}%` }} />
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{gates.length - openGateCount} of {gates.length}</span>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', gatesOpen && 'rotate-180')} />
            </button>
            {gatesOpen && (
              <div className="px-4 pb-3">
                {gateRows}
                {closeCta && <div className="mt-2">{closeCta}</div>}
              </div>
            )}
          </div>
        )}
        <div className="flex-1 overflow-hidden flex">
        <div ref={scrollerRef} className="flex-1 overflow-y-auto">
          {tab === 'activity' ? (
            <div className="h-full"><WoChatTimeline workOrderId={wo.id} persona={isActualOwner ? 'owner' : 'shop'} readOnly={isOwnerView} className="h-full" onAddPart={() => setTab('costs')} onAddLabor={() => setTab('costs')} /></div>
          ) : (
            <div className="p-5 sm:p-6 max-w-3xl mx-auto space-y-4">
              {tab === 'summary' && (
                <SummaryTab {...{ complaint, discrepancy, troubleshooting, findings, correctiveAction, internalNotes, customerNotes, isReadonly, isOwnerView, workType, aircraftTail, dueDate, woTotal, laborTotal: wo.labor_total ?? 0, deposit, aiSummary, aiSummaryGenerating, aiReady, aiSummaryDirty,
                  onComplaint: markField(setComplaint), onDiscrepancy: markField(setDiscrepancy), onTroubleshooting: markField(setTroubleshooting), onFindings: markField(setFindings), onCorrective: markField(setCorrectiveAction),
                  onInternal: markField(setInternalNotes), onCustomer: markField(setCustomerNotes), onMessageMechanic: () => setTab('activity'),
                  onAiChange: (v: string) => { setAiSummary(v); setAiSummaryDirty(true) }, onGenerateAi: handleGenerateAiSummary, onSaveAi: handleSaveAiSummary }} />
              )}
              {tab === 'work' && (
                <WorkTab {...{ checklist, checklistLoading, togglingId, isReadonly, onToggle: handleToggleChecklist, aircraftId, woId: wo.id, onChecklistChanged: () => setChecklist([]) }} />
              )}
              {tab === 'costs' && (
                <CostsTab {...{ lines, wo, taxAmount, woTotal, isReadonly, invoiceReady, generatingInvoice,
                  showAddLine, setShowAddLine, newLine, setNewLine, addingLine, onAddLine: handleAddLine, onDeleteLine: handleDeleteLine, onOpenAIPlan: () => setShowAIPlan(true),
                  onTax: markField(setTaxAmount), onGenerateInvoice: handleGenerateInvoice }} />
              )}
              {tab === 'signoff' && (
                <SignoffTab {...{ wo, logbookEntry, logbookLoading, logbookGenerating, logbookSaving, logbookDraftBody, logbookDirty, rts, rtsOverride, setRtsOverride, isReadonly,
                  onGenerate: handleGenerateLogbookEntry, onBodyChange: (v: string) => { setLogbookDraftBody(v); setLogbookDirty(true) }, onSaveDraft: handleSaveLogbookDraft,
                  onOpenSign: () => setShowSignatureModal(true) }} />
              )}
            </div>
          )}
        </div>

        {/* Close-out rail */}
        {tab !== 'activity' && (
          <aside className="hidden xl:flex w-[280px] flex-shrink-0 flex-col border-l border-border bg-background overflow-y-auto p-4">
            <h3 className="text-sm font-semibold text-foreground">Ready to close?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{gates.length - openGateCount} of {gates.length} steps complete</p>
            <div className="h-1.5 rounded-full bg-muted mt-2.5 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(((gates.length - openGateCount) / gates.length) * 100)}%` }} />
            </div>
            <div className="mt-2">{gateRows}</div>
            {closeCta && <div className="mt-3">{closeCta}</div>}
            <div className="mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground space-y-1">
              <div className="flex justify-between"><span>Opened</span><span>{formatDate(wo.opened_at)}</span></div>
              {wo.closed_at && <div className="flex justify-between"><span>Closed</span><span>{formatDate(wo.closed_at)}</span></div>}
              <div className="flex justify-between"><span>Updated</span><span>{formatDate(wo.updated_at)}</span></div>
            </div>
          </aside>
        )}
        </div>
      </div>

      {/* Save bar */}
      {dirty && !isReadonly && (
        <div className="border-t border-border bg-background px-6 py-3 flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null} Save changes
          </Button>
        </div>
      )}

      {/* Sign modal */}
      {showSignatureModal && logbookEntry && (
        <ESignatureModal
          documentId={logbookEntry.id}
          documentTitle={`Entry for ${wo.work_order_number}`}
          documentType="crs"
          signerName={profile?.full_name || profile?.email || 'Mechanic'}
          signerTitle="A&P / IA"
          signerCert={profile?.mechanic_cert_number || 'CERT-PENDING'}
          context={[{ label: 'Work Order', value: wo.work_order_number }, ...(aircraftTail !== 'Unassigned' ? [{ label: 'Aircraft', value: aircraftTail }] : [])]}
          onCancel={() => setShowSignatureModal(false)}
          onSigned={handleApplySignature}
        />
      )}

      {/* AI Plan drawer (line-item proposer) */}
      <AIPlanDrawer workOrderId={wo.id} open={showAIPlan} onClose={() => setShowAIPlan(false)} onAcceptPlan={handleAcceptPlan} />

      {/* Floating quick-capture — voice note + scan part tag (shop only) */}
      {!isOwnerView && (
        <div className="fixed bottom-4 right-4 z-30 pointer-events-auto flex flex-col items-end gap-2">
          <CameraButton mode="scan-part" label="Scan part tag" />
          <VoiceButton context={{ work_order_id: wo.id, aircraft_id: wo.aircraft_id ?? undefined }} />
        </div>
      )}
    </div>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────────

// "annual_inspection" → "Annual inspection" — raw enum values never reach the UI.
function humanizeEnum(v?: string | null): string | null {
  if (!v) return null
  const s = String(v).replace(/_/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

function Field({ label, value, onChange, readOnly, rows = 3, placeholder }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; rows?: number; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} rows={rows} placeholder={placeholder}
        className={cn('mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-ring', readOnly && 'opacity-70 cursor-default')} />
    </div>
  )
}

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value?: number | null; strong?: boolean }) {
  return <div className={cn('flex items-center justify-between', strong && 'font-semibold')}><span className={cn(!strong && 'text-muted-foreground')}>{label}</span><span className="tabular-nums">${Number(value ?? 0).toFixed(2)}</span></div>
}

function SummaryTab(p: any) {
  return (
    <>
      {/* Owner cost summary — only in the owner view */}
      {p.isOwnerView && (
        <Card title="Your work order" icon={<Receipt className="h-4 w-4 text-emerald-600" />}
          action={<Button size="sm" variant="outline" onClick={p.onMessageMechanic}><MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Message mechanic</Button>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Aircraft</span><span>{p.aircraftTail}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Work type</span><span>{p.workType}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Est. completion</span><span>{p.dueDate ? new Date(p.dueDate).toLocaleDateString() : 'Pending'}</span></div>
            <Row label="Estimated labor" value={p.laborTotal} />
            <Row label="Estimated total" value={p.woTotal} />
            {p.deposit > 0 && <Row label="Approved deposit" value={p.deposit} />}
          </div>
        </Card>
      )}
      <Card title="The job">
        <div className="space-y-3">
          <Field label="Complaint" value={p.complaint} onChange={p.onComplaint} readOnly={p.isReadonly} placeholder="What the owner reported" />
          <Field label="Discrepancy" value={p.discrepancy} onChange={p.onDiscrepancy} readOnly={p.isReadonly} />
          {!p.isOwnerView && <Field label="Troubleshooting notes" value={p.troubleshooting} onChange={p.onTroubleshooting} readOnly={p.isReadonly} placeholder="Steps taken to isolate the problem" />}
          <Field label="Findings" value={p.findings} onChange={p.onFindings} readOnly={p.isReadonly} />
          <Field label="Corrective action" value={p.correctiveAction} onChange={p.onCorrective} readOnly={p.isReadonly} />
          {!p.isOwnerView && <Field label="Internal notes (shop only)" value={p.internalNotes} onChange={p.onInternal} readOnly={p.isReadonly} />}
          <Field label="Customer-visible notes" value={p.customerNotes} onChange={p.onCustomer} readOnly={p.isReadonly || p.isOwnerView} />
        </div>
      </Card>
      <Card title="AI summary" icon={<Sparkles className="h-4 w-4 text-indigo-500" />}
        action={!p.isReadonly && <Button size="sm" variant="outline" onClick={p.onGenerateAi} disabled={p.aiSummaryGenerating}>{p.aiSummaryGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : p.aiReady ? 'Regenerate' : 'Generate'}</Button>}>
        {p.aiReady || !p.isReadonly ? (
          <>
            <textarea value={p.aiSummary} onChange={(e) => p.onAiChange(e.target.value)} readOnly={p.isReadonly} rows={5} placeholder="Generate a wrap-up narrative from the checklist, lines, and activity."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:ring-1 focus:ring-ring" />
            {p.aiSummaryDirty && !p.isReadonly && <div className="mt-2 text-right"><Button size="sm" variant="ghost" onClick={p.onSaveAi}>Save summary</Button></div>}
          </>
        ) : <p className="text-sm text-muted-foreground">No summary yet.</p>}
      </Card>
    </>
  )
}

function WorkTab(p: any) {
  const bySection = new Map<string, ChecklistItem[]>()
  for (const it of p.checklist as ChecklistItem[]) {
    const k = it.section ?? 'General'
    if (!bySection.has(k)) bySection.set(k, [])
    bySection.get(k)!.push(it)
  }
  return (
    <>
      <Card title="Checklist" icon={<ClipboardCheck className="h-4 w-4 text-muted-foreground" />}>
        {p.checklistLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : p.checklist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checklist items.</p>
        ) : (
          <div className="space-y-4">
            {Array.from(bySection.entries()).map(([section, items]) => {
              const done = items.filter((i) => i.completed).length
              return (
                <div key={section}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-foreground">{section}</span>
                    <span className="text-[11px] text-muted-foreground">{done} / {items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((it) => (
                      <button key={it.id} disabled={p.isReadonly || p.togglingId === it.id} onClick={() => p.onToggle(it)}
                        className={cn('w-full flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors', it.completed ? 'border-emerald-200 bg-emerald-50/50' : 'border-border hover:bg-muted/40', p.isReadonly && 'cursor-default')}>
                        {it.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0" />}
                        <span className="flex-1 min-w-0">
                          <span className={cn('text-[13px]', it.completed ? 'text-muted-foreground line-through' : 'text-foreground')}>{it.item_label}</span>
                          {it.required && <span className="ml-2 text-[10px] uppercase text-amber-600">Required</span>}
                          {it.item_description && <span className="block text-[11px] text-muted-foreground mt-0.5">{it.item_description}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      <Card title="AD / SB compliance" icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}>
        {p.aircraftId ? (
          <ADSBManagerPanel aircraftId={p.aircraftId} activeWorkOrderId={p.woId} onChecklistChanged={p.onChecklistChanged} />
        ) : (
          <p className="text-sm text-muted-foreground">Link an aircraft to manage AD / SB compliance.</p>
        )}
      </Card>
    </>
  )
}

function CostsTab(p: any) {
  const isLabor = p.newLine.line_type === 'labor'
  return (
    <>
      <Card title="Line items" icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        action={!p.isReadonly && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={p.onOpenAIPlan}><Sparkles className="h-3.5 w-3.5 mr-1 text-indigo-500" /> Suggest with AI</Button>
            <Button size="sm" variant="outline" onClick={() => p.setShowAddLine((v: boolean) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
          </div>
        )}>
        {p.lines.length === 0 && !p.showAddLine ? (
          <p className="text-sm text-muted-foreground">No line items yet.</p>
        ) : (
          <div className="space-y-1.5">
            {p.lines.map((l: WorkOrderLine) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <span className="text-[10px] uppercase rounded bg-muted px-1.5 py-0.5 text-muted-foreground w-16 text-center shrink-0">{l.line_type}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-foreground truncate">{l.description || '—'}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {l.line_type === 'labor' ? `${Number(l.hours ?? l.quantity ?? 0)} hr × $${Number(l.rate ?? l.unit_price ?? 0).toFixed(2)}` : `${Number(l.quantity ?? 0)} × $${Number(l.unit_price ?? 0).toFixed(2)}`}
                    {l.part_number ? ` · P/N ${l.part_number}` : ''}
                  </span>
                </span>
                <span className="text-[13px] tabular-nums font-medium">${Number(l.line_total ?? 0).toFixed(2)}</span>
                {!p.isReadonly && <button onClick={() => p.onDeleteLine(l.id)} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}

        {p.showAddLine && !p.isReadonly && (
          <form onSubmit={p.onAddLine} className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
            <div className="grid grid-cols-3 gap-2">
              <select value={p.newLine.line_type} onChange={(e) => p.setNewLine((v: any) => ({ ...v, line_type: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-2 text-[13px]">
                <option value="labor">Labor</option><option value="part">Part</option><option value="outside_service">Outside service</option>
              </select>
              <Input className="col-span-2 h-9" placeholder="Description" value={p.newLine.description} onChange={(e) => p.setNewLine((v: any) => ({ ...v, description: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {isLabor ? (
                <>
                  <Input className="h-9" type="number" min="0" step="0.25" placeholder="Hours" value={p.newLine.hours} onChange={(e) => p.setNewLine((v: any) => ({ ...v, hours: e.target.value }))} />
                  <Input className="h-9" type="number" min="0" step="0.01" placeholder="Rate $/hr" value={p.newLine.rate} onChange={(e) => p.setNewLine((v: any) => ({ ...v, rate: e.target.value }))} />
                </>
              ) : (
                <>
                  <Input className="h-9" type="number" min="0" step="1" placeholder="Qty" value={p.newLine.quantity} onChange={(e) => p.setNewLine((v: any) => ({ ...v, quantity: e.target.value }))} />
                  <Input className="h-9" type="number" min="0" step="0.01" placeholder="Unit price" value={p.newLine.unit_price} onChange={(e) => p.setNewLine((v: any) => ({ ...v, unit_price: e.target.value }))} />
                </>
              )}
            </div>
            {p.newLine.line_type === 'part' && (
              <Input className="h-9" placeholder="Part number (optional)" value={p.newLine.part_number} onChange={(e) => p.setNewLine((v: any) => ({ ...v, part_number: e.target.value }))} />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => p.setShowAddLine(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={p.addingLine || !p.newLine.description}>{p.addingLine ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}</Button>
            </div>
          </form>
        )}

        <div className="mt-4 border-t border-border pt-3 space-y-1.5 text-[13px]">
          <Row label="Labor" value={p.wo.labor_total} />
          <Row label="Parts" value={p.wo.parts_total} />
          <Row label="Outside services" value={p.wo.outside_services_total} />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tax</span>
            {p.isReadonly ? <span className="tabular-nums">${(parseFloat(p.taxAmount) || 0).toFixed(2)}</span>
              : <Input className="h-7 w-24 text-right" type="number" min="0" step="0.01" value={p.taxAmount} onChange={(e) => p.onTax(e.target.value)} />}
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 mt-1 font-semibold">
            <span>Total</span><span className="tabular-nums">${p.woTotal.toFixed(2)}</span>
          </div>
        </div>
      </Card>

      <Card title="Invoice" icon={<Receipt className="h-4 w-4 text-muted-foreground" />}>
        {p.invoiceReady ? (
          <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Invoice generated.</p>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Generate an invoice from the billable lines above.</p>
            {!p.isReadonly && <Button size="sm" onClick={p.onGenerateInvoice} disabled={p.generatingInvoice || p.lines.length === 0}>{p.generatingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate invoice'}</Button>}
          </div>
        )}
      </Card>
    </>
  )
}

function SignoffTab(p: any) {
  const entry = p.logbookEntry
  const signed = entry?.status === 'signed'
  const hasBlockers = p.rts.ran && p.rts.blockers.length > 0
  const hasWarnings = p.rts.ran && p.rts.blockers.length === 0 && p.rts.warnings.length > 0
  return (
    <>
      <Card title="Logbook entry" icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
        action={!entry && !p.isReadonly && <Button size="sm" variant="outline" onClick={p.onGenerate} disabled={p.logbookGenerating}>{p.logbookGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Generate draft'}</Button>}>
        {p.logbookLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !entry ? (
          <p className="text-sm text-muted-foreground">No logbook entry yet. Generate an AI draft, review it, then sign.</p>
        ) : signed ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">{entry.entry_text ?? entry.description}</div>
            <Chips ad={entry.ad_numbers} refs={entry.references_used} />
            {entry.signature_audit ? <SignatureBlock sig={entry.signature_audit as SignatureResult} label="Mechanic's signature" />
              : <p className="text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Signed by {entry.mechanic_name}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <textarea value={p.logbookDraftBody} onChange={(e) => p.onBodyChange(e.target.value)} readOnly={p.isReadonly} rows={6}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none resize-none focus:ring-1 focus:ring-ring" />
            <Chips ad={entry.ad_numbers} refs={entry.references_used} />

            {hasBlockers && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p className="font-medium mb-1 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Resolve before signing:</p>
                <ul className="list-disc pl-4 space-y-0.5">{p.rts.blockers.map((b: RtsIssue | string, i: number) => <li key={i}>{rtsIssueText(b)}</li>)}</ul>
                <label className="mt-2 inline-flex items-center gap-1.5 text-[12px]">
                  <input type="checkbox" checked={p.rtsOverride} onChange={(e) => p.setRtsOverride(e.target.checked)} />
                  I accept responsibility — override and sign anyway.
                </label>
              </div>
            )}
            {hasWarnings && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <p className="font-medium mb-1 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Warnings:</p>
                <ul className="list-disc pl-4 space-y-0.5">{p.rts.warnings.map((w: RtsIssue | string, i: number) => <li key={i}>{rtsIssueText(w)}</li>)}</ul>
              </div>
            )}

            {!p.isReadonly && (
              <div className="flex justify-end gap-2">
                {p.logbookDirty && <Button size="sm" variant="ghost" onClick={p.onSaveDraft} disabled={p.logbookSaving}>Save draft</Button>}
                <Button size="sm" variant="outline" onClick={p.onGenerate} disabled={p.logbookGenerating}>{p.logbookGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Regenerate'}</Button>
                <Button size="sm" onClick={p.onOpenSign} disabled={p.logbookDirty || p.rts.loading || (hasBlockers && !p.rtsOverride)}><PenLine className="h-3.5 w-3.5 mr-1.5" /> Sign as RTS</Button>
              </div>
            )}
            {p.logbookDirty && <p className="text-[11px] text-amber-700 text-right">Save your edits before signing.</p>}
          </div>
        )}
      </Card>
      <Card title="Tools used" icon={<Wrench className="h-4 w-4 text-muted-foreground" />}>
        <WoToolsPanel workOrderId={p.wo.id} readOnly={p.isReadonly} />
      </Card>
    </>
  )
}

function Chips({ ad, refs }: { ad?: string[]; refs?: any[] }) {
  const hasAd = Array.isArray(ad) && ad.length > 0
  const hasRefs = Array.isArray(refs) && refs.length > 0
  if (!hasAd && !hasRefs) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasAd && ad!.map((a) => (
        <span key={a} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" /> {a}</span>
      ))}
      {hasRefs && refs!.map((r, i) => (
        <span key={i} className="text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{r.type}: {r.reference}</span>
      ))}
    </div>
  )
}
