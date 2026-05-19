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
  CheckCircle2, Circle, Printer, Link2, Share2, Mail,
  PenLine, AlertCircle, Clock, CalendarDays, MapPin, UserRound,
  Paperclip, Pause, StickyNote, Send, MoreHorizontal,
} from 'lucide-react'
import { ESignatureModal, SignatureBlock, type SignatureResult } from '@/components/work-orders/e-signature-modal'
import { WoChatTimeline } from '@/components/work-orders/wo-chat-timeline'
import { VoiceButton } from '@/components/voice/VoiceButton'
import { CameraButton } from '@/components/camera/CameraButton'
import { AIPlanDrawer } from '@/components/work-orders/ai-plan-drawer'
import { ADSBManagerPanel } from '@/components/aircraft/ad-sb-manager'
import { WoToolsPanel } from '@/components/work-orders/wo-tools-panel'
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
  | 'overview'
  | 'tasks'
  | 'checklist'
  | 'lineitems'
  | 'parts'
  | 'adsb'
  | 'activity'
  | 'chat'
  | 'notes'
  | 'media'
  | 'aisummary'
  | 'ownerview'
  | 'tools'
  | 'logbook'
  | 'invoice'

type TabGroup = 'Execution' | 'Communication' | 'Financial' | 'Outputs'

const TAB_GROUPS: TabGroup[] = ['Execution', 'Communication', 'Financial', 'Outputs']

// The 15 tabs are grouped into 4 labelled sections in the tab strip to cut
// the cognitive load of a flat 15-tab row. Array order = display order.
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; group: TabGroup }[] = [
  // Execution — the hands-on work on the aircraft.
  { id: 'overview', label: 'Overview', icon: FileText, group: 'Execution' },
  { id: 'tasks', label: 'Tasks', icon: ClipboardCheck, group: 'Execution' },
  { id: 'checklist', label: 'Checklist', icon: ClipboardCheck, group: 'Execution' },
  { id: 'parts', label: 'Parts', icon: Package, group: 'Execution' },
  { id: 'adsb', label: 'AD/SB', icon: ShieldCheck, group: 'Execution' },
  { id: 'media', label: 'Media', icon: Camera, group: 'Execution' },
  // Communication — coordinating with the owner and the team.
  { id: 'chat', label: 'Chat', icon: MessageSquare, group: 'Communication' },
  { id: 'notes', label: 'Notes', icon: StickyNote, group: 'Communication' },
  { id: 'ownerview', label: 'Owner View', icon: Eye, group: 'Communication' },
  { id: 'activity', label: 'Activity', icon: MessageSquare, group: 'Communication' },
  // Financial — money in and out.
  { id: 'lineitems', label: 'Line Items', icon: Layers, group: 'Financial' },
  { id: 'invoice', label: 'Invoice', icon: Receipt, group: 'Financial' },
  // Outputs — generated artifacts.
  { id: 'aisummary', label: 'AI Summary', icon: Bot, group: 'Outputs' },
  { id: 'logbook', label: 'Logbook', icon: BookOpen, group: 'Outputs' },
  { id: 'tools', label: 'Tools', icon: Wrench, group: 'Outputs' },
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
  /** Profile for the currently signed-in user — used to pre-fill the e-sign modal. */
  profile?: SignerProfile | null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkOrderDetailClient({ workOrder, aircraft: _aircraft, userRole, profile }: Props) {
  const router = useTenantRouter()
  const [wo, setWo] = useState(workOrder)
  const [lines, setLines] = useState<WorkOrderLine[]>((workOrder.lines as WorkOrderLine[]) ?? [])
  const [saving, setSaving] = useState(false)
  const [approvalLoading, setApprovalLoading] = useState<null | 'approve' | 'reject'>(null)
  const [addingLine, setAddingLine] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAIPlan, setShowAIPlan] = useState(false)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [tab, setTab] = useState<TabId>('overview')

  // Logbook entry state — pulled from /api/logbook-entries?work_order_id=...
  // and refreshed on tab open. The Logbook tab renders editable description
  // for drafts, then opens ESignatureModal for the actual sign.
  const [logbookEntry, setLogbookEntry] = useState<any | null>(null)
  const [logbookLoading, setLogbookLoading] = useState(false)
  const [logbookGenerating, setLogbookGenerating] = useState(false)
  const [logbookSaving, setLogbookSaving] = useState(false)
  const [logbookDraftBody, setLogbookDraftBody] = useState('')
  const [logbookDirty, setLogbookDirty] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)

  // AI Summary state — aggregated narrative from checklist + lines + activity.
  // Cached on work_orders.ai_summary, regenerated on demand.
  const [aiSummary, setAiSummary] = useState<string>(((wo as any).ai_summary as string) ?? '')
  const [aiSummaryGeneratedAt, setAiSummaryGeneratedAt] = useState<string | null>(((wo as any).ai_summary_generated_at as string) ?? null)
  const [aiSummaryStats, setAiSummaryStats] = useState<{
    checklist_total?: number; checklist_completed?: number; adsb_resolved?: number;
    line_items_count?: number; parts_count?: number; labor_count?: number;
  } | null>(null)
  const [aiSummaryGenerating, setAiSummaryGenerating] = useState(false)
  const [aiSummaryDirty, setAiSummaryDirty] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  // Close the share menu on outside click.
  useEffect(() => {
    if (!shareMenuOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (target.closest('[data-share-menu]')) return
      setShareMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [shareMenuOpen])

  async function handleCopyLink() {
    try {
      const url = `${window.location.origin}/work-orders/${wo.id}`
      await navigator.clipboard.writeText(url)
      toast.success('Link copied to clipboard')
    } catch {
      toast.error('Could not copy link')
    }
    setShareMenuOpen(false)
  }

  function handlePrint() {
    setShareMenuOpen(false)
    setTimeout(() => window.print(), 50)
  }

  function handleEmailCustomer() {
    setShareMenuOpen(false)
    const url = `${window.location.origin}/work-orders/${wo.id}`
    const subject = `Work Order ${wo.work_order_number}`
    const body = `Here's the work order detail link:\n\n${url}`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  function handlePrimaryAction() {
    if (wo.status === 'draft') {
      void handleStatusChange('open')
      return
    }
    if (wo.status === 'open') {
      void handleStatusChange('in_progress')
      return
    }
    if (wo.status === 'in_progress') {
      setTab(openGateCount > 0 ? 'overview' : 'aisummary')
      return
    }
    if (wo.status === 'ready_for_signoff') {
      setTab('logbook')
      return
    }
    if (wo.status === 'closed' || wo.status === 'invoiced' || wo.status === 'paid') {
      setTab('invoice')
      return
    }
    setTab('overview')
  }

  function primaryActionLabel() {
    if (wo.status === 'draft') return 'Continue Setup'
    if (wo.status === 'open') return 'Start Work'
    if (wo.status === 'in_progress') return openGateCount > 0 ? 'Review Progress' : 'Review Summary'
    if (wo.status === 'awaiting_approval') return 'Review Approval'
    if (wo.status === 'awaiting_parts') return 'Review Parts'
    if (wo.status === 'ready_for_signoff') return 'IA Review'
    if (wo.status === 'closed' || wo.status === 'invoiced' || wo.status === 'paid') return 'Open Invoice'
    return 'Review Work Order'
  }

  // Editable fields
  const [complaint, setComplaint] = useState(workOrder.customer_complaint ?? (workOrder as any).complaint ?? '')
  const [discrepancy, setDiscrepancy] = useState(workOrder.discrepancy ?? '')
  const [troubleshootingNotes, setTroubleshootingNotes] = useState(workOrder.troubleshooting_notes ?? '')
  const [findings, setFindings] = useState(workOrder.findings ?? '')
  const [correctiveAction, setCorrectiveAction] = useState(workOrder.corrective_action ?? '')
  const [internalNotes, setInternalNotes] = useState(workOrder.internal_notes ?? '')
  const [customerNotes, setCustomerNotes] = useState(workOrder.customer_notes ?? (workOrder as any).customer_visible_notes ?? '')
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
  const completedChecklistCount = checklist.filter((item) => item.completed).length
  const requiredChecklist = checklist.filter((item) => item.required)
  const incompleteRequiredChecklist = requiredChecklist.filter((item) => !item.completed)
  const adSbItems = checklist.filter((item) => item.source === 'ad_sb' || item.source === 'ad')
  const adSbIncomplete = adSbItems.filter((item) => item.required && !item.completed)
  const laborLines = lines.filter((line) => line.line_type === 'labor')
  const partLines = lines.filter((line) => line.line_type === 'part')
  const outsideLines = lines.filter((line) => line.line_type === 'outside_service')
  const lineItemCount = laborLines.length + partLines.length + outsideLines.length
  const logbookReady = Boolean((wo as any).linked_logbook_entry_id || logbookEntry?.id)
  const invoiceReady = Boolean((wo as any).linked_invoice_id || ['invoiced', 'paid'].includes(wo.status))
  const aiReady = Boolean(aiSummary.trim())
  const closureGates = [
    { id: 'checklist', label: 'Required checklist complete', complete: requiredChecklist.length === 0 ? checklist.length > 0 : incompleteRequiredChecklist.length === 0, count: incompleteRequiredChecklist.length },
    { id: 'adsb', label: 'AD/SB reviewed or resolved', complete: adSbIncomplete.length === 0, count: adSbIncomplete.length },
    { id: 'lines', label: 'Labor and parts reconciled', complete: lineItemCount > 0, count: lineItemCount },
    { id: 'ai', label: 'AI summary reviewed', complete: aiReady, count: aiReady ? 1 : 0 },
    { id: 'logbook', label: 'Logbook drafted or signed', complete: logbookReady, count: logbookReady ? 1 : 0 },
    { id: 'invoice', label: 'Invoice generated or intentionally skipped', complete: invoiceReady, count: invoiceReady ? 1 : 0 },
  ]
  const openGateCount = closureGates.filter((gate) => !gate.complete).length
  const taskCards = buildTaskCards({
    checklist,
    lines,
    status: wo.status,
    assignedMechanicId: wo.assigned_mechanic_id,
    serviceType: (wo as any).service_type,
  })
  const taskProgress = taskCards.length
    ? Math.round((taskCards.filter((task) => task.status === 'Completed').length / taskCards.length) * 100)
    : 0
  const aircraftTail = (wo as any).aircraft?.tail_number ?? 'Unassigned'
  const aircraftModel = [((wo as any).aircraft?.make), ((wo as any).aircraft?.model)].filter(Boolean).join(' ') || 'Aircraft'
  const workType = (wo as any).service_type ?? 'Maintenance'
  const priority = (wo as any).priority ?? 'Normal'
  const location = (wo as any).location?.name ?? (wo as any).shop_location ?? 'Location not set'
  const dueDate = (wo as any).due_date ?? (wo as any).estimated_completion_date ?? null
  const ownerName = (wo as any).customer?.name ?? (wo as any).customer?.full_name ?? (wo as any).customer?.email ?? 'Owner'
  const statusStageIndex = getStatusStageIndex(wo.status)
  const statusStages = [
    { label: 'Created', detail: formatDate(wo.opened_at), complete: statusStageIndex >= 0 },
    { label: 'In Progress', detail: wo.assigned_mechanic_id ? 'Assigned mechanic' : 'Unassigned', complete: statusStageIndex >= 1 },
    { label: 'QA / Inspection', detail: openGateCount === 0 ? 'Ready' : `${openGateCount} gate${openGateCount === 1 ? '' : 's'} open`, complete: statusStageIndex >= 2 },
    { label: 'Completed', detail: wo.closed_at ? formatDate(wo.closed_at) : 'Pending close', complete: statusStageIndex >= 3 },
  ]

  // ─── Load checklist for overview/tasks/checklist readiness surfaces ────────
  useEffect(() => {
    if (!['overview', 'tasks', 'checklist', 'ownerview', 'aisummary'].includes(tab) || checklist.length > 0 || checklistLoading) return
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

  // ─── Load logbook entry for this WO (if exists) when Logbook tab opens ────
  useEffect(() => {
    if (!['logbook', 'aisummary'].includes(tab)) return
    let cancelled = false
    void (async () => {
      setLogbookLoading(true)
      try {
        const res = await fetch(`/api/logbook-entries?work_order_id=${wo.id}&limit=1`)
        if (!res.ok) return
        const json = await res.json()
        const entry = Array.isArray(json.entries) && json.entries.length > 0
          ? json.entries[0]
          : Array.isArray(json) && json.length > 0
            ? json[0]
            : null
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

  async function handleGenerateLogbookEntry() {
    setLogbookGenerating(true)
    try {
      // Step 1 — generate the AI draft body (description, parts, refs, ADs).
      const aiRes = await fetch('/api/ai/generate-logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: (wo as any).aircraft_id,
          work_order_id: wo.id,
        }),
      })
      const aiJson = await aiRes.json().catch(() => ({}))
      if (!aiRes.ok) {
        toast.error(aiJson?.error || 'AI logbook generation failed')
        return
      }

      // Step 2 — persist as a draft entry tied to this WO.
      const entryRes = await fetch('/api/logbook-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: (wo as any).aircraft_id,
          work_order_id: wo.id,
          entry_type: aiJson.entry_type ?? 'maintenance',
          entry_date: new Date().toISOString().slice(0, 10),
          description: aiJson.description ?? '',
          parts_used: aiJson.parts_used ?? [],
          references_used: aiJson.references_used ?? [],
          ad_numbers: aiJson.ad_numbers ?? [],
          status: 'draft',
        }),
      })
      const entry = await entryRes.json().catch(() => ({}))
      if (!entryRes.ok) {
        toast.error(entry?.error || 'Failed to save logbook draft')
        return
      }
      setLogbookEntry(entry)
      setLogbookDraftBody(entry.entry_text ?? entry.description ?? aiJson.description ?? '')
      setLogbookDirty(false)
      await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_logbook_entry_id: entry.id }),
      }).catch(() => null)
      setWo((prev) => ({ ...prev, linked_logbook_entry_id: entry.id } as any))
      toast.success('Logbook draft generated — review and sign')
    } catch {
      toast.error('Logbook generation failed')
    } finally {
      setLogbookGenerating(false)
    }
  }

  async function handleSaveLogbookDraft() {
    if (!logbookEntry || !logbookDirty) return
    setLogbookSaving(true)
    try {
      const res = await fetch(`/api/logbook-entries/${logbookEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: logbookDraftBody }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Save failed')
        return
      }
      const updated = await res.json()
      setLogbookEntry(updated)
      setLogbookDirty(false)
      toast.success('Draft saved')
    } finally {
      setLogbookSaving(false)
    }
  }

  async function handleGenerateAiSummary() {
    setAiSummaryGenerating(true)
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/ai-summary`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error || 'AI summary failed')
        return
      }
      setAiSummary(j.summary ?? '')
      setAiSummaryGeneratedAt(j.generated_at ?? new Date().toISOString())
      setAiSummaryStats(j.stats ?? null)
      setAiSummaryDirty(false)
      toast.success('AI summary generated')
    } catch {
      toast.error('AI summary failed')
    } finally {
      setAiSummaryGenerating(false)
    }
  }

  async function handleSaveAiSummary() {
    if (!aiSummaryDirty) return
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_summary: aiSummary }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Save failed')
        return
      }
      setAiSummaryDirty(false)
      toast.success('Summary saved')
    } catch {
      toast.error('Save failed')
    }
  }

  async function handleAutoGenerateInvoice() {
    setGeneratingInvoice(true)
    try {
      // Save any pending summary edits first so the invoice notes match.
      if (aiSummaryDirty) await handleSaveAiSummary()

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_order_id: wo.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error || 'Could not generate invoice')
        return
      }
      toast.success('Invoice generated')
      router.push(`/invoices/${j.id}`)
    } catch {
      toast.error('Could not generate invoice')
    } finally {
      setGeneratingInvoice(false)
    }
  }

  async function handleApplySignature(sig: SignatureResult) {
    if (!logbookEntry) return
    try {
      // Save any unsaved body edits first so the signed version captures them.
      if (logbookDirty) await handleSaveLogbookDraft()

      const res = await fetch(`/api/logbook-entries/${logbookEntry.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mechanic_name: sig.signerName,
          mechanic_cert_number: sig.signerCert,
          cert_type: 'A&P',
          signature_audit: sig,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error || 'Sign failed')
        return
      }
      setLogbookEntry(j)
      setShowSignatureModal(false)
      toast.success('Logbook entry signed and sealed')
    } catch {
      toast.error('Sign failed')
    }
  }

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
        <div className="px-4 sm:px-6 pt-4 pb-3 space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <button onClick={() => router.push('/work-orders')} className="text-primary hover:underline">Work Orders</button>
                <span>/</span>
                <span className="font-mono">{wo.work_order_number}</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold font-mono text-foreground tracking-tight">{wo.work_order_number}</h1>
                <span className={cn('inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border', STATUS_COLOR[wo.status as WorkOrderStatus] ?? STATUS_COLOR.draft)}>
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
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1" /> Print
              </Button>
              {!isReadonly && (
                <Button size="sm" variant="outline" onClick={() => setTab('lineitems')}>
                  <PenLine className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              )}
              <Button size="sm" onClick={handlePrimaryAction} disabled={isOwnerView && wo.status !== 'awaiting_approval'}>
                {primaryActionLabel()}
              </Button>
              {dirty && (
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </Button>
              )}
              <div className="relative" data-share-menu>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShareMenuOpen((o) => !o)}
                  aria-label="Share work order"
                  title="Share, print, or export"
                >
                  <Share2 className="h-3.5 w-3.5 mr-1" /> Share
                  <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
                </Button>
                {shareMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-border bg-white shadow-lg z-30 overflow-hidden">
                    <a
                      href={`/api/work-orders/${wo.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShareMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">Download PDF</div>
                        <div className="text-[11px] text-muted-foreground">Includes line items + totals</div>
                      </div>
                    </a>
                    <button onClick={handleCopyLink} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">Copy link</div>
                        <div className="text-[11px] text-muted-foreground">Share with anyone in your org</div>
                      </div>
                    </button>
                    <button onClick={handleEmailCustomer} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left border-t border-border">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">Email work order</div>
                        <div className="text-[11px] text-muted-foreground">Compose with link pre-filled</div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-xs">
            <HeaderFact icon={Plane} label="Aircraft" value={aircraftTail} subvalue={aircraftModel} />
            <HeaderFact icon={MapPin} label="Location" value={location} subvalue={(wo as any).hangar ? `Hangar ${(wo as any).hangar}` : undefined} />
            <HeaderFact icon={AlertCircle} label="Priority" value={priority} subvalue={openGateCount === 0 ? 'No close blockers' : `${openGateCount} close gates open`} />
            <HeaderFact icon={CalendarDays} label="Created" value={formatDate(wo.opened_at)} subvalue={formatTimeLabel(wo.opened_at)} />
            <HeaderFact icon={CalendarDays} label="Due Date" value={dueDate ? formatDate(dueDate) : 'Not set'} subvalue={dueDate ? 'Target completion' : 'Set in work plan'} />
            <HeaderFact icon={Wrench} label="Work Type" value={workType} subvalue={`${taskProgress}% task progress`} />
          </div>
        </div>

        {/* Tab strip — grouped into 4 labelled sections (Execution /
            Communication / Financial / Outputs) to reduce the cognitive
            load of a flat 15-tab row. */}
        <div className="flex items-center gap-0.5 px-4 overflow-x-auto">
          {TAB_GROUPS.map((group, gi) => (
            <div key={group} className="flex items-center gap-0.5">
              {gi > 0 && (
                <div className="mx-1.5 h-5 w-px shrink-0 bg-border" aria-hidden />
              )}
              <span className="shrink-0 select-none px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group}
              </span>
              {TABS.filter((t) => t.group === group).map((t) => {
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
          ))}
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

        {/* Overview — spec-aligned operating picture */}
        {tab === 'overview' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_230px_1fr] gap-4">
              <section className="rounded-lg border border-border bg-white p-4">
                <h2 className="text-base font-semibold text-foreground">Description</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
                  <p className="whitespace-pre-wrap">{complaint || 'No customer complaint or work scope has been recorded yet.'}</p>
                  {(discrepancy || findings || correctiveAction) && (
                    <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                      {discrepancy && <li>Discrepancy: {discrepancy}</li>}
                      {findings && <li>Finding: {findings}</li>}
                      {correctiveAction && <li>Corrective action: {correctiveAction}</li>}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-white p-4">
                <h2 className="text-base font-semibold text-foreground">Status</h2>
                <div className="mt-4 space-y-3">
                  {statusStages.map((stage, index) => (
                    <div key={stage.label} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className={cn('h-5 w-5 rounded-full border flex items-center justify-center', stage.complete ? 'bg-primary border-primary text-primary-foreground' : 'bg-white border-border text-muted-foreground')}>
                          {stage.complete ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                        </span>
                        {index < statusStages.length - 1 && <span className="h-8 w-px bg-border" />}
                      </div>
                      <div className="min-w-0 pb-1">
                        <div className="text-sm font-medium text-foreground">{stage.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{stage.detail || 'Pending'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-white p-4">
                <h2 className="text-base font-semibold text-foreground">Details</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <DetailTerm label="Work Order Type" value={workType} />
                  <DetailTerm label="Category" value={(wo as any).category ?? 'Inspection'} />
                  <DetailTerm label="Estimated Labor" value={`${laborLines.reduce((sum, line) => sum + Number(line.hours ?? line.quantity ?? 0), 0).toFixed(1)} hrs`} />
                  <DetailTerm label="Actual Cost" value={`$${woTotal.toFixed(2)}`} />
                  <DetailTerm label="Owner" value={ownerName} />
                  <DetailTerm label="Line Items" value={`${lineItemCount} billable`} />
                </dl>
                <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    Attachments
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Photos and files uploaded in Activity are retained with the work order audit trail.</p>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
              <section className="rounded-lg border border-border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-foreground">Tasks</h2>
                  <Button size="sm" variant="ghost" onClick={() => setTab('tasks')}>
                    Add Task
                  </Button>
                </div>
                <ExecutionTaskTable tasks={taskCards.slice(0, 6)} onOpen={(task) => setTab(task.source === 'lineitems' ? 'lineitems' : task.source === 'adsb' ? 'adsb' : 'checklist')} />
              </section>

              <section className="rounded-lg border border-border bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-foreground">Line Items <span className="text-xs font-normal text-muted-foreground">(From Estimate)</span></h2>
                  <Button size="sm" variant="ghost" onClick={() => setTab('lineitems')}>Open</Button>
                </div>
                <MiniLineItems lines={lines} woTotal={woTotal} taxAmount={parseFloat(taxAmount) || 0} />
              </section>
            </div>

            <section className="rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Close Gates</h2>
                <span className="text-xs text-muted-foreground">{openGateCount === 0 ? 'Ready for close review' : `${openGateCount} open`}</span>
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {closureGates.map((gate) => (
                  <GateButton key={gate.id} gate={gate} onClick={() => {
                    if (gate.id === 'checklist' || gate.id === 'adsb') setTab(gate.id === 'adsb' ? 'adsb' : 'checklist')
                    else if (gate.id === 'lines') setTab('lineitems')
                    else if (gate.id === 'ai') setTab('aisummary')
                    else if (gate.id === 'logbook') setTab('logbook')
                    else if (gate.id === 'invoice') setTab('invoice')
                  }} />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Tasks — assignment cards derived from checklist, AD/SB, and line state */}
        {tab === 'tasks' && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Tasks</h2>
                <p className="text-xs text-muted-foreground">
                  Assignment cards keep work execution clean while the current schema stores the durable facts as checklist rows, line items, activity, logbook, and invoice records.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setTab('activity')}>
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                  Activity
                </Button>
                <Button size="sm" onClick={() => setTab('checklist')}>
                  <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                  Checklist
                </Button>
              </div>
            </div>

            {checklistLoading && <InlineLoading label="Loading task context" />}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {taskCards.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={() => setTab(task.source === 'lineitems' ? 'lineitems' : task.source === 'adsb' ? 'adsb' : 'checklist')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Activity — immutable-style execution timeline */}
        {tab === 'activity' && (
          <ActivityBoard
            tasks={taskCards}
            lines={lines}
            checklist={checklist}
            onOpenChat={() => setTab('chat')}
            onOpenNotes={() => setTab('notes')}
          />
        )}

        {/* Chat — team communication separated from notes and audit activity */}
        {tab === 'chat' && (
          <div className="h-full">
            <WoChatTimeline
              workOrderId={wo.id}
              className="h-full"
              onAddPart={() => setTab('lineitems')}
              onAddLabor={() => setTab('lineitems')}
            />
          </div>
        )}

        {/* Notes — internal maintenance notes and customer-visible notes */}
        {tab === 'notes' && (
          <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="rounded-lg border border-border bg-white p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">Internal Notes</h2>
                </div>
                <textarea
                  value={internalNotes}
                  onChange={(e) => { setInternalNotes(e.target.value); markDirty() }}
                  readOnly={isReadonly}
                  rows={10}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Pinned internal notes, findings, reminders, and handoff context."
                />
              </section>
              <section className="rounded-lg border border-border bg-white p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">Owner-visible Notes</h2>
                </div>
                <textarea
                  value={customerNotes}
                  onChange={(e) => { setCustomerNotes(e.target.value); markDirty() }}
                  readOnly={isReadonly || isOwnerView}
                  rows={10}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Only approved customer-facing status goes here."
                />
              </section>
            </div>
          </div>
        )}

        {/* Checklist — template-driven, AI-augmented, mechanic-toggleable */}
        {tab === 'checklist' && (
          <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
            <section className="rounded-lg border border-border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] text-muted-foreground">
                    Work Orders / {wo.work_order_number} / Tasks
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">Task &amp; Checklist Execution</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}</span>
                    <span>Mechanic: {wo.assigned_mechanic_id ? 'Assigned mechanic' : 'Unassigned'}</span>
                    <span>Due: {dueDate ? formatDate(dueDate) : 'Not set'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2 hidden sm:block">
                    <div className="font-mono text-xl font-bold text-foreground">01:12:34</div>
                    <div className="text-[11px] text-emerald-700 font-medium">Timer ready</div>
                  </div>
                  <Button size="sm" variant="outline"><Pause className="h-3.5 w-3.5 mr-1" /> Pause</Button>
                  <Button size="sm" variant="outline" className="text-red-700 border-red-200 hover:bg-red-50">Stop</Button>
                  <Button size="sm" onClick={() => handleStatusChange('ready_for_signoff')}>Mark Complete</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px]">
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Inspection Checklist</h3>
                      <p className="text-xs text-muted-foreground">{completedChecklistCount} / {checklist.length || 0} completed ({checklist.length ? Math.round((completedChecklistCount / checklist.length) * 100) : 0}%)</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setTab('adsb')}>AD/SB</Button>
                      <Button size="sm" variant="outline" onClick={() => setTab('lineitems')}>Parts &amp; Labor</Button>
                    </div>
                  </div>

                  {checklistLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading checklist…
                    </div>
                  )}

                  {!checklistLoading && checklist.length === 0 && (
                    <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
                      No checklist items yet. AD/SB items added from the AD/SB tab will land here.
                    </div>
                  )}

                  {checklist.length > 0 && (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 border-b border-border">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Item</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Requirement</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Note / Finding</th>
                            <th className="px-3 py-2 text-center font-medium text-muted-foreground uppercase tracking-wide">Photo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-white">
                          {checklist.map((item, index) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="px-3 py-2 align-top font-medium text-foreground">
                                <div>{index + 1}. {item.section ?? 'General'}</div>
                                <div className="mt-0.5 text-[11px] text-muted-foreground">{item.item_label}</div>
                              </td>
                              <td className="px-3 py-2 align-top text-muted-foreground">
                                {item.item_description || item.source_reference || 'Inspect and record condition.'}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <button
                                  onClick={() => handleToggleChecklist(item)}
                                  disabled={isReadonly || checklistTogglingId === item.id}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50',
                                    item.completed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : item.required ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200',
                                  )}
                                >
                                  {item.completed ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                                  {item.completed ? 'Pass' : item.required ? 'Required' : 'Not Started'}
                                </button>
                              </td>
                              <td className="px-3 py-2 align-top text-muted-foreground">
                                {item.completed ? 'Good condition recorded.' : item.required ? 'Needs mechanic review.' : 'No finding yet.'}
                              </td>
                              <td className="px-3 py-2 align-top text-center">
                                <button disabled title="Photo capture — coming soon" aria-label="Add photo (coming soon)" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground opacity-50 cursor-not-allowed">
                                  <Camera className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <aside className="border-t xl:border-t-0 xl:border-l border-border bg-muted/20 p-4 space-y-4">
                  <TaskActivityRail tasks={taskCards} />
                  <div className="rounded-lg border border-border bg-white p-4">
                    <h3 className="text-sm font-semibold text-foreground">Time &amp; Labor</h3>
                    <dl className="mt-3 space-y-2 text-xs">
                      <DetailTerm label="Started" value={wo.opened_at ? formatDate(wo.opened_at) : 'Not started'} />
                      <DetailTerm label="Current Duration" value="01:12:34" />
                      <DetailTerm label="Labor Type" value={workType} />
                    </dl>
                    <button onClick={() => { setTab('lineitems'); setShowAddLine(true); setNewLine((prev) => ({ ...prev, line_type: 'labor' })) }} className="mt-3 text-xs font-semibold text-primary hover:underline">
                      + Add Manual Time
                    </button>
                  </div>
                </aside>
              </div>
            </section>
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

        {/* Parts — inventory lifecycle surface for work-order parts */}
        {tab === 'parts' && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">Parts</h2>
                <p className="text-xs text-muted-foreground">Track requested, ordered, received, installed, returned, customer-supplied, and not-billable parts from the work order.</p>
              </div>
              {!isReadonly && (
                <Button size="sm" onClick={() => { setTab('lineitems'); setShowAddLine(true); setNewLine((prev) => ({ ...prev, line_type: 'part' })) }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
                </Button>
              )}
            </div>
            <div className="rounded-lg border border-border bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Part</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">State</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Inventory Action</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {partLines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">No parts have been added yet.</td>
                    </tr>
                  ) : partLines.map((line) => (
                    <tr key={line.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium text-foreground">{line.description}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{line.part_number || 'No P/N'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {line.status ? titleize(line.status) : 'Needed'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <button disabled title="Coming soon" className="rounded-md border border-border px-2 py-1 text-[11px] opacity-50 cursor-not-allowed">Reserve</button>
                          <button disabled title="Coming soon" className="rounded-md border border-border px-2 py-1 text-[11px] opacity-50 cursor-not-allowed">Install</button>
                          <button disabled title="Coming soon" className="rounded-md border border-border px-2 py-1 text-[11px] opacity-50 cursor-not-allowed">Attach 8130</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">${(line.line_total ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
            {/* Header card — explains the role of AI Summary in the WO lifecycle */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground" style={{ fontWeight: 600 }}>AI Summary &amp; Auto-Generate</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Aggregates the completed checklist, resolved AD/SB items, all line items, and recent activity into a single plain-language narrative.
                    The summary is the source for both the auto-generated invoice and the auto-generated logbook entry.
                  </p>
                </div>
              </div>
            </div>

            {/* Stats strip */}
            {aiSummaryStats && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { label: 'Checklist',  value: `${aiSummaryStats.checklist_completed ?? 0}/${aiSummaryStats.checklist_total ?? 0}` },
                  { label: 'AD/SB done', value: aiSummaryStats.adsb_resolved ?? 0 },
                  { label: 'Line items', value: aiSummaryStats.line_items_count ?? 0 },
                  { label: 'Parts',      value: aiSummaryStats.parts_count ?? 0 },
                  { label: 'Labor',      value: aiSummaryStats.labor_count ?? 0 },
                  { label: 'Status',     value: STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-border rounded-lg px-2.5 py-2">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>{s.label}</div>
                    <div className="text-[14px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Summary editor */}
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <h2 className="text-sm font-semibold text-foreground">Wrap-Up Summary</h2>
                </div>
                {aiSummaryGeneratedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    Generated {new Date(aiSummaryGeneratedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="p-5 space-y-3">
                {!aiSummary ? (
                  <div className="text-center py-8">
                    <Sparkles className="h-10 w-10 text-violet-300 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">No summary yet — click below to generate one from the WO's checklist + line items + activity.</p>
                    <Button onClick={handleGenerateAiSummary} disabled={aiSummaryGenerating || isReadonly}>
                      {aiSummaryGenerating ? (
                        <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</>
                      ) : (
                        <><Sparkles className="h-4 w-4 mr-1.5" /> Generate AI Summary</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={aiSummary}
                      onChange={(e) => { setAiSummary(e.target.value); setAiSummaryDirty(true) }}
                      readOnly={isReadonly}
                      rows={8}
                      className={cn(
                        'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30',
                        isReadonly && 'opacity-70 cursor-not-allowed bg-muted/30',
                      )}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={handleGenerateAiSummary} disabled={aiSummaryGenerating || isReadonly}>
                        {aiSummaryGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                        Regenerate
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleSaveAiSummary} disabled={!aiSummaryDirty || isReadonly}>
                        <Save className="h-3.5 w-3.5 mr-1" /> Save
                      </Button>
                      <div className="flex-1" />
                      {/* Generate logbook + Generate invoice — wired to the existing handlers */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setTab('logbook'); if (!logbookEntry) handleGenerateLogbookEntry() }}
                        disabled={isReadonly || logbookGenerating}
                      >
                        {logbookGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
                        Generate Logbook Entry
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAutoGenerateInvoice}
                        disabled={isReadonly || generatingInvoice || lines.length === 0}
                      >
                        {generatingInvoice ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Receipt className="h-3.5 w-3.5 mr-1" />}
                        Generate Invoice
                      </Button>
                    </div>
                    {aiSummaryDirty && (
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
                        <AlertCircle className="h-3 w-3 mt-0.5" />
                        Unsaved changes — Save before generating invoice or logbook.
                      </div>
                    )}
                    {lines.length === 0 && (
                      <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <AlertCircle className="h-3 w-3 mt-0.5" />
                        No line items yet — invoice generation needs at least one billable line.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="rounded-xl border border-border bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-amber-700" />
                    <h2 className="text-sm font-semibold text-foreground">Logbook Entry (Draft)</h2>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab('logbook')}>Open</Button>
                </div>
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 min-h-[180px] text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {logbookDraftBody || aiSummary || 'Generate the AI summary, then draft and sign the logbook entry from reviewed work performed, parts, AD/SB, and return-to-service language.'}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{logbookEntry?.status === 'signed' ? 'Signed' : logbookEntry ? 'Draft saved' : 'No draft yet'}</span>
                  {!logbookEntry && (
                    <Button size="sm" variant="outline" onClick={handleGenerateLogbookEntry} disabled={logbookGenerating || isOwnerView}>
                      {logbookGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      Draft
                    </Button>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-emerald-600" />
                    <h2 className="text-sm font-semibold text-foreground">Invoice Summary</h2>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setTab('invoice')}>Open</Button>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <TotalRow label="Subtotal" value={woTotal - (parseFloat(taxAmount) || 0)} />
                  <TotalRow label="Tax" value={parseFloat(taxAmount) || 0} />
                  <TotalRow label="Total" value={woTotal} strong />
                </div>
                <Button className="mt-4 w-full" onClick={handleAutoGenerateInvoice} disabled={isReadonly || generatingInvoice || lines.length === 0}>
                  {generatingInvoice ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Receipt className="h-3.5 w-3.5 mr-1" />}
                  Create Invoice
                </Button>
                {lines.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Add approved line items before invoicing.</p>}
              </section>
            </div>

            {/* Reveal the existing AI Plan (line-item proposer) as a secondary action */}
            <details className="bg-white rounded-xl border border-border">
              <summary className="px-5 py-3 cursor-pointer text-sm text-foreground flex items-center gap-2 select-none" style={{ fontWeight: 600 }}>
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                Or run AI Plan to propose line items from the complaint
              </summary>
              <div className="px-5 pb-4">
                <p className="text-xs text-muted-foreground mb-3">
                  AI Plan works in the other direction: reads the complaint &amp; aircraft history, proposes labor/parts you can accept as line items.
                </p>
                <Button variant="outline" size="sm" onClick={() => setShowAIPlan(true)} disabled={isReadonly}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Run AI Plan
                </Button>
              </div>
            </details>
          </div>
        )}

        {/* Owner View */}
        {tab === 'ownerview' && (
          <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
            <section className="rounded-lg border border-border bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold font-mono text-foreground">{wo.work_order_number}</h2>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <DetailTerm label="Aircraft" value={aircraftTail} />
                    <DetailTerm label="Work Type" value={workType} />
                    <DetailTerm label="Location" value={location} />
                    <DetailTerm label="Est. Completion" value={dueDate ? formatDate(dueDate) : 'Pending'} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Owner-facing preview. Internal notes, private chat, and compliance-only drafts stay hidden.
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
              <section className="rounded-lg border border-border bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-foreground">Work Progress</h2>
                  <span className="text-xs text-muted-foreground">{taskProgress}% complete</span>
                </div>
                <div className="mt-3 space-y-3">
                  {taskCards.slice(0, 5).map((task) => (
                    <div key={task.id} className="grid grid-cols-[1fr_110px_80px] items-center gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        {task.status === 'Completed' ? <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="truncate text-foreground">{task.title}</span>
                      </div>
                      <span className="text-muted-foreground">{task.status}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{task.progress}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-lg border border-border bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <OwnerActivityLine label="Checklist updated" value={`${completedChecklistCount}/${checklist.length || 0} complete`} />
                    <OwnerActivityLine label="Parts / labor" value={`${lineItemCount} billable line${lineItemCount === 1 ? '' : 's'}`} />
                    <OwnerActivityLine label="Close gates" value={openGateCount === 0 ? 'Ready for review' : `${openGateCount} still open`} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" onClick={() => setTab('chat')}>Message Mechanic</Button>
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-lg border border-border bg-white p-4">
                  <h2 className="text-base font-semibold text-foreground">Estimate Summary</h2>
                  <div className="mt-3 space-y-2 text-sm">
                    <TotalRow label="Estimated Labor" value={wo.labor_total ?? 0} />
                    <TotalRow label="Estimated Cost" value={woTotal} />
                    <TotalRow label="Approved Deposit" value={Number((wo as any).deposit_amount ?? 0)} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Owner will be notified for additional approval requests or scope changes.</p>
                </section>
                <section className="rounded-lg border border-border bg-white p-4">
                  <h2 className="text-base font-semibold text-foreground">Customer-visible Notes</h2>
                  <textarea
                    value={customerNotes}
                    onChange={(e) => { setCustomerNotes(e.target.value); markDirty() }}
                    readOnly={isReadonly || isOwnerView}
                    rows={5}
                    className="mt-3 w-full rounded-md border border-input bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Approved status note for the owner."
                  />
                </section>
              </aside>
            </div>
          </div>
        )}

        {/* AD / SB — per-aircraft, with Add to WO buttons */}
        {tab === 'adsb' && (
          <div className="p-6 max-w-5xl mx-auto space-y-3">
            {/* Quick jump back to the checklist where overdue/unknown ADs
                already live as required items at WO open. Saves the mechanic
                from leaving the WO to verify what's queued up. */}
            <div className="flex items-center justify-between gap-3 bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3">
              <div className="text-[12px] text-blue-900">
                <span className="font-semibold">Tip:</span>{' '}
                Overdue and unverified AD/SB items are auto-added to this work order&rsquo;s checklist at creation.
                They must be marked complete before the WO can move to Ready for Sign-off or Closed.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 bg-white"
                onClick={() => setTab('checklist')}
              >
                <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
                Open Checklist
              </Button>
            </div>
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

        {/* Tools used — sprint 2.6.1 cross-wire. Adding an overdue tool is
            blocked server-side at /api/work-orders/[id]/tools (returns 409). */}
        {tab === 'tools' && (
          <div className="p-6 max-w-3xl mx-auto">
            <WoToolsPanel workOrderId={wo.id} />
          </div>
        )}

        {/* Logbook — generate AI draft, edit, e-sign with audit trail */}
        {tab === 'logbook' && (
          <div className="p-6 max-w-3xl mx-auto">
            {logbookLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading logbook entry…
              </div>
            ) : !logbookEntry ? (
              /* No entry yet — show the "Generate" CTA */
              <div className="rounded-xl border border-border bg-white p-6">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-amber-700" />
                  <h2 className="text-base font-semibold text-foreground">Logbook Entry</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Generate a maintenance logbook entry for this work order. AI drafts the corrective-action language from the line items, completed checklist, and resolved AD/SB items — you review &amp; e-sign.
                </p>
                <Button
                  onClick={handleGenerateLogbookEntry}
                  disabled={logbookGenerating || isOwnerView}
                >
                  {logbookGenerating ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Drafting…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1.5" /> Generate AI Logbook Entry</>
                  )}
                </Button>
              </div>
            ) : (
              /* Entry exists — render editor + signature flow */
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-amber-700" />
                      <h2 className="text-sm font-semibold text-foreground">Logbook Entry</h2>
                      {logbookEntry.status === 'signed' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                          <CheckCircle2 className="h-2.5 w-2.5" /> Signed &amp; sealed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                          Draft
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {logbookEntry.entry_type ? String(logbookEntry.entry_type).replace(/_/g, ' ') : 'maintenance'}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Editable description (locked once signed) */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                        Entry Description
                      </Label>
                      <textarea
                        value={logbookDraftBody}
                        onChange={(e) => {
                          setLogbookDraftBody(e.target.value)
                          setLogbookDirty(true)
                        }}
                        disabled={logbookEntry.status === 'signed'}
                        rows={8}
                        className={cn(
                          'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed font-mono outline-none focus:ring-2 focus:ring-primary/30',
                          logbookEntry.status === 'signed' && 'opacity-70 cursor-not-allowed bg-muted/30',
                        )}
                      />
                    </div>

                    {/* AD / Reference chips */}
                    {(Array.isArray(logbookEntry.ad_numbers) && logbookEntry.ad_numbers.length > 0) && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>ADs cited:</span>
                        {(logbookEntry.ad_numbers as string[]).map((ad) => (
                          <span key={ad} className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                            <ShieldCheck className="h-3 w-3" /> {ad}
                          </span>
                        ))}
                      </div>
                    )}
                    {(Array.isArray(logbookEntry.references_used) && logbookEntry.references_used.length > 0) && (
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-[11px] text-muted-foreground mt-0.5" style={{ fontWeight: 600 }}>References:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {(logbookEntry.references_used as any[]).map((r, i) => (
                            <span key={i} className="text-[11px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full" style={{ fontWeight: 500 }}>
                              {r.type}: {r.reference}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action row */}
                    {logbookEntry.status !== 'signed' && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveLogbookDraft}
                          disabled={!logbookDirty || logbookSaving}
                        >
                          {logbookSaving ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…</>
                          ) : (
                            <><Save className="h-3.5 w-3.5 mr-1" /> Save Draft</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleGenerateLogbookEntry}
                          variant="outline"
                          disabled={logbookGenerating}
                          title="Re-run AI to regenerate the description from latest line items"
                        >
                          {logbookGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                          Regenerate
                        </Button>
                        <div className="flex-1" />
                        <Button
                          size="sm"
                          onClick={() => setShowSignatureModal(true)}
                          disabled={logbookDirty}
                          title={logbookDirty ? 'Save your edits before signing' : 'Sign and seal this entry'}
                        >
                          <PenLine className="h-3.5 w-3.5 mr-1" /> Sign Entry
                        </Button>
                      </div>
                    )}
                    {logbookDirty && logbookEntry.status !== 'signed' && (
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
                        <AlertCircle className="h-3 w-3 mt-0.5" />
                        Unsaved changes. Save before signing.
                      </div>
                    )}
                  </div>
                </div>

                {/* Signed proof block */}
                {logbookEntry.status === 'signed' && logbookEntry.signature_audit && (
                  <SignatureBlock sig={logbookEntry.signature_audit as SignatureResult} label="Mechanic's Signature" />
                )}
                {logbookEntry.status === 'signed' && !logbookEntry.signature_audit && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 inline -mt-0.5 mr-1.5" />
                    Signed by <strong>{logbookEntry.mechanic_name}</strong>
                    {logbookEntry.mechanic_cert_number ? <> ({logbookEntry.cert_type} #{logbookEntry.mechanic_cert_number})</> : null}
                    {logbookEntry.signed_at ? <> on {new Date(logbookEntry.signed_at).toLocaleString()}</> : null}
                  </div>
                )}
              </div>
            )}

            {/* Signature modal */}
            {showSignatureModal && logbookEntry && (
              <ESignatureModal
                documentId={logbookEntry.id}
                documentTitle={`Entry for ${wo.work_order_number}`}
                documentType="crs"
                signerName={profile?.full_name || profile?.email || 'Mechanic'}
                signerTitle="A&P / IA"
                signerCert={profile?.mechanic_cert_number || 'CERT-PENDING'}
                context={[
                  { label: 'Work Order',      value: wo.work_order_number },
                  ...(((wo as any).aircraft?.tail_number) ? [{ label: 'Aircraft', value: (wo as any).aircraft.tail_number }] : []),
                  { label: 'Entry Type',      value: String(logbookEntry.entry_type ?? 'maintenance').replace(/_/g, ' ') },
                ]}
                onCancel={() => setShowSignatureModal(false)}
                onSigned={handleApplySignature}
              />
            )}
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

      {!isOwnerView && (
        <div className="md:hidden fixed bottom-3 left-3 right-20 z-30 rounded-xl border border-border bg-white shadow-lg px-2 py-2 grid grid-cols-5 gap-1">
          <button type="button" onClick={() => setTab('activity')} className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted">
            <Clock className="h-4 w-4 text-primary" />
            Timer
          </button>
          <button type="button" onClick={() => { setTab('lineitems'); setShowAddLine(true); setNewLine((prev) => ({ ...prev, line_type: 'part' })) }} className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted">
            <Package className="h-4 w-4 text-primary" />
            Part
          </button>
          <button type="button" onClick={() => { setTab('lineitems'); setShowAddLine(true); setNewLine((prev) => ({ ...prev, line_type: 'labor' })) }} className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted">
            <Wrench className="h-4 w-4 text-primary" />
            Labor
          </button>
          <button type="button" onClick={() => setTab('activity')} className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted">
            <MessageSquare className="h-4 w-4 text-primary" />
            Chat
          </button>
          <button type="button" onClick={() => setTab('tasks')} className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted">
            <MoreHorizontal className="h-4 w-4 text-primary" />
            Actions
          </button>
        </div>
      )}

      {/* AI Plan Drawer */}
      <AIPlanDrawer
        workOrderId={wo.id}
        open={showAIPlan}
        onClose={() => setShowAIPlan(false)}
        onAcceptPlan={handleAcceptPlan}
      />

      {/* Spec polish.voice-camera-rollout — voice + camera input on the
          WO detail surface. Voice floats bottom-right; CameraButton
          mode='scan-part' lets the mechanic scan a part tag into this WO.
          z-30 sits below the save-bar (z-40) when both are on screen. */}
      <div className="fixed bottom-4 right-4 z-30 pointer-events-auto flex flex-col items-end gap-2">
        <CameraButton mode="scan-part" label="Scan part tag" />
        <VoiceButton context={{ work_order_id: wo.id, aircraft_id: wo.aircraft_id ?? undefined }} />
      </div>
    </div>
  )
}

type TaskCardModel = {
  id: string
  title: string
  role: string
  assignedTo: string
  status: 'Not Started' | 'In Progress' | 'Blocked' | 'Ready for Review' | 'Completed'
  progress: number
  gate: string
  dueLabel: string
  laborLabel: string
  partsLabel: string
  blocker?: string
  source: 'checklist' | 'adsb' | 'lineitems' | 'closeout'
}

function buildTaskCards({
  checklist,
  lines,
  status,
  assignedMechanicId,
  serviceType,
}: {
  checklist: ChecklistItem[]
  lines: WorkOrderLine[]
  status: WorkOrderStatus
  assignedMechanicId: string | null
  serviceType?: string | null
}): TaskCardModel[] {
  const cards: TaskCardModel[] = []
  const bySection = new Map<string, ChecklistItem[]>()
  for (const item of checklist) {
    const key = item.section ?? 'General'
    if (!bySection.has(key)) bySection.set(key, [])
    bySection.get(key)!.push(item)
  }

  if (bySection.size === 0) {
    cards.push({
      id: 'scope',
      title: serviceType ? `${serviceType} execution` : 'Work-order execution',
      role: 'A&P mechanic',
      assignedTo: assignedMechanicId ? 'Assigned mechanic' : 'Unassigned',
      status: status === 'draft' || status === 'open' ? 'Not Started' : 'In Progress',
      progress: status === 'draft' || status === 'open' ? 0 : 25,
      gate: 'Required',
      dueLabel: 'Open',
      laborLabel: `${lines.filter((line) => line.line_type === 'labor').length} labor lines`,
      partsLabel: `${lines.filter((line) => line.line_type === 'part').length} parts`,
      source: 'checklist',
    })
  }

  Array.from(bySection.entries()).forEach(([section, items]) => {
    const completed = items.filter((item) => item.completed).length
    const requiredOpen = items.filter((item) => item.required && !item.completed).length
    const progress = items.length ? Math.round((completed / items.length) * 100) : 0
    const isAd = items.some((item) => item.source === 'ad_sb' || item.source === 'ad')
    cards.push({
      id: `section-${section}`,
      title: section,
      role: isAd ? 'IA / Lead' : 'A&P mechanic',
      assignedTo: assignedMechanicId ? 'Assigned mechanic' : isAd ? 'IA / Lead' : 'Unassigned',
      status: progress === 100 ? 'Completed' : completed > 0 ? 'In Progress' : requiredOpen > 0 && isAd ? 'Blocked' : 'Not Started',
      progress,
      gate: isAd ? 'Required for IA' : requiredOpen > 0 ? 'Required' : 'Optional',
      dueLabel: requiredOpen > 0 ? `${requiredOpen} required open` : 'No blockers',
      laborLabel: `${lines.filter((line) => line.line_type === 'labor').length} labor lines`,
      partsLabel: `${lines.filter((line) => line.line_type === 'part').length} parts`,
      blocker: requiredOpen > 0 ? `${requiredOpen} required item${requiredOpen === 1 ? '' : 's'} incomplete` : undefined,
      source: isAd ? 'adsb' : 'checklist',
    })
  })

  const billableLines = lines.filter((line) => !['note', 'discrepancy'].includes(line.line_type))
  cards.push({
    id: 'line-items',
    title: 'Reconcile line items',
    role: 'Lead mechanic / Billing',
    assignedTo: 'Lead mechanic',
    status: billableLines.length > 0 ? 'Ready for Review' : 'Not Started',
    progress: billableLines.length > 0 ? 70 : 0,
    gate: 'Required for invoice',
    dueLabel: `${billableLines.length} billable line${billableLines.length === 1 ? '' : 's'}`,
    laborLabel: `${lines.filter((line) => line.line_type === 'labor').length} labor`,
    partsLabel: `${lines.filter((line) => line.line_type === 'part').length} parts`,
    blocker: billableLines.length === 0 ? 'No approved actual work lines yet' : undefined,
    source: 'lineitems',
  })

  cards.push({
    id: 'closeout',
    title: 'AI summary, logbook, and invoice closeout',
    role: 'IA / Admin',
    assignedTo: 'Lead / IA',
    status: ['closed', 'invoiced', 'paid', 'archived'].includes(status) ? 'Completed' : 'Ready for Review',
    progress: ['closed', 'invoiced', 'paid', 'archived'].includes(status) ? 100 : 35,
    gate: 'Required for close',
    dueLabel: 'Before close',
    laborLabel: 'AI review',
    partsLabel: 'Invoice + logbook',
    source: 'closeout',
  })

  return cards
}

function getStatusStageIndex(status: WorkOrderStatus) {
  if (['draft', 'open'].includes(status)) return 0
  if (['awaiting_approval', 'awaiting_parts', 'in_progress', 'waiting_on_customer'].includes(status)) return 1
  if (status === 'ready_for_signoff') return 2
  return 3
}

function titleize(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTimeLabel(iso?: string | null) {
  if (!iso) return undefined
  const time = iso.match(/T(\d{2}):(\d{2})/)
  if (!time) return undefined
  const hour = Number(time[1])
  const minute = time[2]
  if (!Number.isFinite(hour)) return undefined
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute} ${period}`
}

function DetailTerm({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-semibold text-foreground">{value || '-'}</dd>
    </div>
  )
}

function TotalRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong && 'border-t border-border pt-2 font-bold')}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">${Number(value || 0).toFixed(2)}</span>
    </div>
  )
}

function GateButton({
  gate,
  onClick,
}: {
  gate: { id: string; label: string; complete: boolean; count: number }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/30 transition-colors"
    >
      <span className="text-sm text-foreground">{gate.label}</span>
      <span className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        gate.complete ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200',
      )}>
        {gate.complete ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {gate.complete ? 'Ready' : 'Open'}
      </span>
    </button>
  )
}

function ExecutionTaskTable({
  tasks,
  onOpen,
}: {
  tasks: TaskCardModel[]
  onOpen: (task: TaskCardModel) => void
}) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/40 border-b border-border">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Task</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Assigned To</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Status</th>
          <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Gate</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {tasks.map((task) => (
          <tr key={task.id} className="hover:bg-muted/20">
            <td className="px-3 py-2">
              <div className="font-medium text-foreground">{task.title}</div>
              <div className="text-[11px] text-muted-foreground">{task.role}</div>
            </td>
            <td className="px-3 py-2 text-muted-foreground">{task.assignedTo}</td>
            <td className="px-3 py-2">
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', taskStatusClass(task.status))}>{task.status}</span>
            </td>
            <td className="px-3 py-2 text-muted-foreground">{task.gate}</td>
            <td className="px-3 py-2 text-right">
              <Button size="sm" variant="ghost" onClick={() => onOpen(task)}>View</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MiniLineItems({ lines, woTotal, taxAmount }: { lines: WorkOrderLine[]; woTotal: number; taxAmount: number }) {
  const visibleLines = lines.filter((line) => !['note', 'discrepancy'].includes(line.line_type)).slice(0, 6)
  return (
    <div>
      <table className="w-full text-xs">
        <thead className="bg-muted/40 border-b border-border">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wide">Item</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Qty</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visibleLines.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-8 text-center text-sm text-muted-foreground">No billable line items yet.</td>
            </tr>
          ) : visibleLines.map((line) => (
            <tr key={line.id}>
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{line.description}</div>
                <div className="text-[11px] text-muted-foreground">{LINE_TYPE_LABEL[line.line_type]}</div>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{line.quantity}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">${(line.line_total ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t border-border bg-muted/20 p-3 text-sm space-y-1">
        <TotalRow label="Subtotal" value={woTotal - taxAmount} />
        <TotalRow label="Tax" value={taxAmount} />
        <TotalRow label="Total" value={woTotal} strong />
      </div>
    </div>
  )
}

function TaskActivityRail({ tasks }: { tasks: TaskCardModel[] }) {
  const events = tasks.slice(0, 5)
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <h3 className="text-sm font-semibold text-foreground">Task Activity</h3>
      <div className="mt-3 space-y-3">
        {events.map((task) => (
          <div key={task.id} className="flex gap-2 text-xs">
            <span className={cn('mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0', task.status === 'Completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-border bg-white text-muted-foreground')}>
              {task.status === 'Completed' ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-foreground truncate">{task.assignedTo}</div>
              <div className="text-muted-foreground truncate">{task.title} · {task.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ActivityBoard({
  tasks,
  lines,
  checklist,
  onOpenChat,
  onOpenNotes,
}: {
  tasks: TaskCardModel[]
  lines: WorkOrderLine[]
  checklist: ChecklistItem[]
  onOpenChat: () => void
  onOpenNotes: () => void
}) {
  const events = [
    { icon: ClipboardCheck, label: 'Work order opened', meta: `${tasks.length} generated task${tasks.length === 1 ? '' : 's'}` },
    { icon: CheckCircle2, label: 'Checklist updated', meta: `${checklist.filter((item) => item.completed).length}/${checklist.length || 0} items complete` },
    { icon: Package, label: 'Parts / labor reconciled', meta: `${lines.filter((line) => !['note', 'discrepancy'].includes(line.line_type)).length} billable line${lines.length === 1 ? '' : 's'}` },
    { icon: AlertCircle, label: 'Close gate review', meta: 'AI summary, logbook, and invoice are required before close' },
  ]
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_320px] gap-4">
        <section className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Activity Timeline</h2>
            <button className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 space-y-4">
            {events.map((event) => {
              const Icon = event.icon
              return (
                <div key={event.label} className="flex gap-3">
                  <span className="h-7 w-7 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{event.label}</div>
                    <div className="text-xs text-muted-foreground">{event.meta}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Internal Chat</h2>
            <Button size="sm" variant="outline" onClick={onOpenChat}>Open Chat</Button>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <ChatPreview author="Mechanic" body="Inspection execution is in progress. Add findings, photos, and parts from the action buttons." />
            <ChatPreview author="Lead" body="Review required checklist items and hand off any failed item as a discrepancy." />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex-1">Message internal team...</span>
            <Send className="h-3.5 w-3.5" />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Owner Chat</h2>
            <Button size="sm" variant="outline" onClick={onOpenNotes}>Notes</Button>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <ChatPreview author="Owner" body="Can you confirm if additional parts are needed?" muted />
            <ChatPreview author="Shop" body="We will update you after checklist review and estimate reconciliation." />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex-1">Message owner...</span>
            <Send className="h-3.5 w-3.5" />
          </div>
        </section>
      </div>
    </div>
  )
}

function ChatPreview({ author, body, muted = false }: { author: string; body: string; muted?: boolean }) {
  return (
    <div className={cn('rounded-lg px-3 py-2', muted ? 'bg-muted/50 text-muted-foreground' : 'bg-blue-50 text-blue-950')}>
      <div className="text-[11px] font-semibold">{author}</div>
      <div className="mt-1 text-xs leading-relaxed">{body}</div>
    </div>
  )
}

function OwnerActivityLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function HeaderFact({
  icon: Icon,
  label,
  value,
  subvalue,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  subvalue?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-semibold text-foreground">{value}</div>
      {subvalue && <div className="truncate text-[11px] text-muted-foreground">{subvalue}</div>}
    </div>
  )
}

function taskStatusClass(status: TaskCardModel['status']) {
  if (status === 'Completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'In Progress' || status === 'Ready for Review') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (status === 'Blocked') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-50 text-slate-600 border-slate-200'
}

function TaskCard({
  task,
  compact = false,
  onOpen,
}: {
  task: TaskCardModel
  compact?: boolean
  onOpen: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{task.role} · {task.assignedTo}</p>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', taskStatusClass(task.status))}>
          {task.status}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${task.progress}%` }} />
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">{task.progress}%</span>
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Gate</div>
            <div className="font-semibold text-foreground">{task.gate}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Due</div>
            <div className="font-semibold text-foreground">{task.dueLabel}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Labor</div>
            <div className="font-semibold text-foreground">{task.laborLabel}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-2 py-1.5">
            <div className="text-[10px] uppercase text-muted-foreground">Parts</div>
            <div className="font-semibold text-foreground">{task.partsLabel}</div>
          </div>
        </div>
      )}
      {task.blocker && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {task.blocker}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onOpen}>
          Open
        </Button>
      </div>
    </div>
  )
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}...
    </div>
  )
}
