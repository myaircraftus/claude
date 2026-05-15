'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Link2,
  Mic,
  Pencil,
  Plus,
  Route,
  Search,
  ShieldCheck,
  Upload,
  Wrench,
} from 'lucide-react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatDateTime } from '@/lib/utils'

export type AircraftOption = {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  owner_customer_id?: string | null
}

export type SquawkRecord = {
  id: string
  aircraft_id: string
  title: string
  description?: string | null
  category?: string | null
  severity: string
  status: string
  source?: string | null
  source_metadata?: Record<string, unknown> | null
  owner_visible?: boolean | null
  owner_summary?: string | null
  current_route_type?: string | null
  assigned_work_order_id?: string | null
  linked_estimate_id?: string | null
  reported_at?: string | null
  resolved_at?: string | null
  created_at: string
  updated_at?: string | null
  suggested_ata_code?: string | null
  suggested_jasc_code?: string | null
  confirmed_ata_code?: string | null
  confirmed_jasc_code?: string | null
  classification_status?: string | null
  aircraft?: { id: string; tail_number: string; make?: string | null; model?: string | null } | null
  reporter?: { id: string; full_name?: string | null; email?: string | null } | null
  evidence?: Array<{ id: string; evidence_type: string; file_name?: string | null; owner_visible?: boolean | null; created_at: string }>
  ai_drafts?: Array<{ id: string; status: string; confidence?: number | null; suggested_title?: string | null; created_at: string }>
  status_history?: Array<{ id: string; from_status?: string | null; to_status: string; reason?: string | null; created_at: string }>
}

type Props = {
  mode: 'global' | 'aircraft'
  initialSquawks: SquawkRecord[]
  aircraftOptions: AircraftOption[]
  lockedAircraft?: AircraftOption | null
}

const statusMeta: Record<string, { label: string; className: string; icon: any }> = {
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-700', icon: FileText },
  open: { label: 'Open', className: 'bg-blue-100 text-blue-800', icon: AlertTriangle },
  acknowledged: { label: 'Acknowledged', className: 'bg-sky-100 text-sky-800', icon: Clock3 },
  needs_review: { label: 'Needs Review', className: 'bg-amber-100 text-amber-800', icon: Bot },
  high_priority: { label: 'High Priority', className: 'bg-red-100 text-red-800', icon: AlertTriangle },
  routed_to_estimate: { label: 'Estimate', className: 'bg-orange-100 text-orange-800', icon: FileText },
  awaiting_owner_approval: { label: 'Approval', className: 'bg-purple-100 text-purple-800', icon: Eye },
  added_to_work_order: { label: 'In WO', className: 'bg-indigo-100 text-indigo-800', icon: Wrench },
  in_work_order: { label: 'In WO', className: 'bg-indigo-100 text-indigo-800', icon: Wrench },
  in_progress: { label: 'In Progress', className: 'bg-indigo-100 text-indigo-800', icon: Wrench },
  waiting_for_parts: { label: 'Waiting Parts', className: 'bg-amber-100 text-amber-800', icon: Clock3 },
  deferred: { label: 'Deferred', className: 'bg-slate-100 text-slate-700', icon: Clock3 },
  resolved: { label: 'Resolved', className: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  closed_duplicate: { label: 'Duplicate', className: 'bg-slate-100 text-slate-700', icon: Link2 },
  closed_not_reproducible: { label: 'Not Repro', className: 'bg-slate-100 text-slate-700', icon: ShieldCheck },
  closed_owner_declined: { label: 'Declined', className: 'bg-red-100 text-red-800', icon: AlertTriangle },
  archived: { label: 'Archived', className: 'bg-slate-100 text-slate-700', icon: FileText },
}

const severityMeta: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-emerald-50 text-emerald-700' },
  minor: { label: 'Minor', className: 'bg-emerald-50 text-emerald-700' },
  medium: { label: 'Medium', className: 'bg-amber-50 text-amber-700' },
  normal: { label: 'Normal', className: 'bg-blue-50 text-blue-700' },
  high: { label: 'High', className: 'bg-red-50 text-red-700' },
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
  grounding: { label: 'Grounding', className: 'bg-red-100 text-red-800' },
  cosmetic: { label: 'Cosmetic', className: 'bg-slate-100 text-slate-700' },
  needs_review: { label: 'Needs Review', className: 'bg-amber-50 text-amber-700' },
}

const queueFilters = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'approval', label: 'Approval' },
  { value: 'linked', label: 'Linked' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'closed', label: 'Closed' },
  { value: 'ai_review', label: 'AI Review' },
]

const lifecycle = [
  ['Open', 'Capture discrepancy'],
  ['Verify', 'Human review'],
  ['Evidence', 'Attach media'],
  ['Route', 'Estimate or WO'],
  ['Resolve', 'Close with reason'],
  ['Audit', 'Timeline linked'],
]

function labelForStatus(status: string) {
  return statusMeta[status]?.label ?? status.replace(/_/g, ' ')
}

function labelForSeverity(severity: string) {
  return severityMeta[severity]?.label ?? severity.replace(/_/g, ' ')
}

function normalizeSeverity(value: string) {
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  if (normalized === 'low') return 'low'
  return normalized || 'normal'
}

function safeDate(value?: string | null) {
  if (!value) return 'Not recorded'
  try {
    return formatDateTime(value)
  } catch {
    return 'Not recorded'
  }
}

export function SquawksWorkspace({ mode, initialSquawks, aircraftOptions, lockedAircraft }: Props) {
  const router = useTenantRouter()
  const [squawks, setSquawks] = useState(initialSquawks)
  const [selectedId, setSelectedId] = useState(initialSquawks[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const [form, setForm] = useState({
    aircraft_id: lockedAircraft?.id ?? '',
    transcript: '',
    title: '',
    description: '',
    category: 'General',
    severity: 'normal',
    owner_visible: false,
    owner_summary: '',
    evidence_note: '',
    suggested_ata_code: '',
    suggested_jasc_code: '',
  })
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    category: '',
    severity: 'normal',
    status: 'open',
    owner_visible: false,
    owner_summary: '',
    reason: '',
  })
  const [routeForm, setRouteForm] = useState({
    route_type: 'existing_work_order',
    target_record_id: '',
    reason: '',
    owner_visible: false,
  })

  const selected = squawks.find((item) => item.id === selectedId) ?? squawks[0] ?? null

  const counts = useMemo(() => {
    const open = squawks.filter((s) => !['resolved', 'closed_duplicate', 'closed_not_reproducible', 'closed_owner_declined', 'archived'].includes(s.status)).length
    const high = squawks.filter((s) => ['high', 'critical', 'grounding', 'urgent'].includes(s.severity)).length
    const linked = squawks.filter((s) => s.assigned_work_order_id || s.linked_estimate_id || s.status === 'added_to_work_order' || s.status === 'in_work_order').length
    const approval = squawks.filter((s) => s.status === 'awaiting_owner_approval' || s.status === 'routed_to_estimate').length
    const deferred = squawks.filter((s) => s.status === 'deferred').length
    const aiReview = squawks.filter((s) => s.classification_status === 'suggested' || s.status === 'needs_review' || (s.ai_drafts?.length ?? 0) > 0).length
    return { open, high, linked, approval, deferred, aiReview }
  }, [squawks])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return squawks.filter((s) => {
      const closed = ['resolved', 'closed_duplicate', 'closed_not_reproducible', 'closed_owner_declined', 'archived'].includes(s.status)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'open' && !closed) ||
        (filter === 'high' && ['high', 'critical', 'grounding', 'urgent'].includes(s.severity)) ||
        (filter === 'approval' && ['awaiting_owner_approval', 'routed_to_estimate'].includes(s.status)) ||
        (filter === 'linked' && Boolean(s.assigned_work_order_id || s.linked_estimate_id || s.status === 'added_to_work_order' || s.status === 'in_work_order')) ||
        (filter === 'deferred' && s.status === 'deferred') ||
        (filter === 'closed' && closed) ||
        (filter === 'ai_review' && (s.status === 'needs_review' || s.classification_status === 'suggested' || (s.ai_drafts?.length ?? 0) > 0))
      if (!matchesFilter) return false
      if (!needle) return true
      const haystack = [
        s.title,
        s.description,
        s.category,
        s.aircraft?.tail_number,
        s.aircraft?.make,
        s.aircraft?.model,
        s.reporter?.full_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [filter, query, squawks])

  function resetForm() {
    setForm({
      aircraft_id: lockedAircraft?.id ?? '',
      transcript: '',
      title: '',
      description: '',
      category: 'General',
      severity: 'normal',
      owner_visible: false,
      owner_summary: '',
      evidence_note: '',
      suggested_ata_code: '',
      suggested_jasc_code: '',
    })
  }

  async function generateDraft() {
    if (!form.transcript.trim() && !form.description.trim()) {
      toast.error('Enter squawk text before generating a draft.')
      return
    }
    setDrafting(true)
    try {
      const aircraft = aircraftOptions.find((item) => item.id === form.aircraft_id) ?? lockedAircraft
      const res = await fetch('/api/squawks/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: form.transcript || form.description,
          grounded: ['critical', 'grounding'].includes(form.severity),
          aircraft,
          tail_number: aircraft?.tail_number,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate AI draft')
      setForm((prev) => ({
        ...prev,
        title: data.title ?? prev.title,
        description: data.description ?? prev.description,
        category: data.category ?? prev.category,
        severity: normalizeSeverity(data.severity ?? prev.severity),
        suggested_ata_code: data.suggested_ata_code ?? '',
        suggested_jasc_code: data.suggested_jasc_code ?? '',
      }))
      toast.success('AI draft ready for review.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate AI draft')
    } finally {
      setDrafting(false)
    }
  }

  async function createSquawk() {
    if (!form.aircraft_id) {
      toast.error('Select aircraft before saving the squawk.')
      return
    }
    if (!form.title.trim()) {
      toast.error('Title is required before saving.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/squawks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: form.aircraft_id,
          title: form.title,
          description: form.description,
          category: form.category,
          severity: form.severity,
          source: form.transcript ? 'dictation' : 'manual',
          transcript: form.transcript,
          owner_visible: form.owner_visible,
          owner_summary: form.owner_summary,
          source_context: mode === 'aircraft' ? 'aircraft_workspace' : 'squawks_global_queue',
          suggested_ata_code: form.suggested_ata_code || null,
          suggested_jasc_code: form.suggested_jasc_code || null,
          ai_draft: {
            prompt: form.transcript || form.description,
            suggested_title: form.title,
            suggested_description: form.description,
            suggested_category: form.category,
            suggested_severity: form.severity,
            confidence: form.suggested_ata_code || form.suggested_jasc_code ? 0.72 : 0.58,
            warnings: form.suggested_ata_code ? [] : ['Classification needs human review.'],
          },
          evidence: form.evidence_note
            ? [{ evidence_type: 'transcript', transcript: form.evidence_note, file_name: 'capture-note.txt' }]
            : [],
          human_verified: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create squawk')
      setSquawks((prev) => [data, ...prev])
      setSelectedId(data.id)
      setCreateOpen(false)
      resetForm()
      toast.success('Squawk saved and verified.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create squawk')
    } finally {
      setSaving(false)
    }
  }

  function openEdit() {
    if (!selected) return
    setEditForm({
      title: selected.title,
      description: selected.description ?? '',
      category: selected.category ?? '',
      severity: selected.severity,
      status: selected.status,
      owner_visible: Boolean(selected.owner_visible),
      owner_summary: selected.owner_summary ?? '',
      reason: '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!selected) return
    if (!editForm.reason.trim()) {
      toast.error('Edit reason is required.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/squawks/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          edit_reason: editForm.reason,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update squawk')
      setSquawks((prev) => prev.map((item) => item.id === selected.id ? data : item))
      setSelectedId(data.id)
      setEditOpen(false)
      toast.success('Squawk updated.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update squawk')
    } finally {
      setSaving(false)
    }
  }

  function openRoute(routeType: string) {
    setRouteForm({ route_type: routeType, target_record_id: '', reason: '', owner_visible: routeType === 'owner_approval' })
    setRouteOpen(true)
  }

  async function submitRoute() {
    if (!selected) return
    if (['defer', 'close', 'duplicate', 'no_action'].includes(routeForm.route_type) && !routeForm.reason.trim()) {
      toast.error('Reason is required for this route.')
      return
    }
    setSaving(true)
    try {
      let targetRecordId = routeForm.target_record_id || null
      if (routeForm.route_type === 'estimate') {
        const estimateRes = await fetch('/api/estimates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aircraft_id: selected.aircraft_id,
            service_type: selected.title,
            customer_notes: selected.description,
            internal_notes: `Created from squawk ${selected.id}`,
            linked_squawk_ids: [selected.id],
            status: 'draft',
          }),
        })
        const estimate = await estimateRes.json()
        if (!estimateRes.ok) throw new Error(estimate.error ?? 'Failed to create estimate')
        targetRecordId = estimate.id
      }

      const res = await fetch(`/api/squawks/${selected.id}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route_type: routeForm.route_type,
          target_record_id: targetRecordId,
          reason: routeForm.reason,
          owner_visible: routeForm.owner_visible,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to route squawk')
      setSquawks((prev) => prev.map((item) => item.id === selected.id ? data.squawk : item))
      setSelectedId(data.squawk.id)
      setRouteOpen(false)
      toast.success('Squawk routed.')
      if (routeForm.route_type === 'estimate' && targetRecordId) router.push(`/estimates/${targetRecordId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to route squawk')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-5">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-slate-950">
              {mode === 'aircraft' && lockedAircraft ? `${lockedAircraft.tail_number} Squawks` : 'Squawks'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Discrepancy queue with evidence, routing, owner visibility, and audit trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFilter('ai_review')}>
              <Bot className="h-4 w-4" /> AI Review
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Squawk
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <Metric label="Open" value={counts.open} tone="blue" />
          <Metric label="High Priority" value={counts.high} tone="red" />
          <Metric label="Linked WO/Estimate" value={counts.linked} tone="indigo" />
          <Metric label="Awaiting Approval" value={counts.approval} tone="amber" />
          <Metric label="Deferred" value={counts.deferred} tone="slate" />
          <Metric label="AI Review" value={counts.aiReview} tone="purple" />
        </div>

        <Card className="rounded-lg border-slate-200 bg-white shadow-none">
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-6">
              {lifecycle.map(([title, subtitle], index) => (
                <div key={title} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{title}</p>
                    <p className="truncate text-xs text-slate-500">{subtitle}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(420px,0.95fr)_minmax(620px,1.25fr)]">
          <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search squawk, tail, owner, category..."
                    className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {queueFilters.map((item) => (
                    <Button
                      key={item.value}
                      variant={filter === item.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilter(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <div className="grid grid-cols-[0.7fr_1.3fr_0.65fr] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                    <span>Aircraft</span>
                    <span>Squawk</span>
                    <span>Status</span>
                  </div>
                  <div className="max-h-[620px] overflow-y-auto">
                    {filtered.map((squawk) => (
                      <button
                        key={squawk.id}
                        className={cn(
                          'grid w-full grid-cols-[0.7fr_1.3fr_0.65fr] items-center gap-2 border-t border-slate-100 px-3 py-3 text-left hover:bg-slate-50',
                          selected?.id === squawk.id && 'bg-blue-50 hover:bg-blue-50'
                        )}
                        onClick={() => setSelectedId(squawk.id)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{squawk.aircraft?.tail_number ?? 'Aircraft'}</p>
                          <p className="truncate text-xs text-slate-500">{squawk.aircraft?.model ?? squawk.aircraft?.make ?? ''}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{squawk.title}</p>
                          <p className="truncate text-xs text-slate-500">{squawk.category ?? squawk.description ?? 'Uncategorized'}</p>
                        </div>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={squawk.status} />
                          <SeverityBadge severity={squawk.severity} />
                        </div>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="px-4 py-10 text-center text-sm text-slate-500">No squawks match this view.</div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5">
            {selected ? (
              <>
                <Card className="rounded-lg border-slate-200 bg-white shadow-none">
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-bold text-slate-950">{selected.title}</h2>
                          <SeverityBadge severity={selected.severity} />
                          <StatusBadge status={selected.status} />
                          {selected.owner_visible && <Badge className="bg-emerald-50 text-emerald-700">Owner visible</Badge>}
                        </div>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{selected.description || 'No verified description recorded.'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={openEdit}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        <Button onClick={() => openRoute('existing_work_order')}>
                          <Route className="h-4 w-4" /> Route
                        </Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-4">
                      <Info label="Aircraft" value={selected.aircraft?.tail_number ?? 'Not linked'} />
                      <Info label="Category" value={selected.category ?? 'Needs review'} />
                      <Info label="Source" value={(selected.source ?? 'manual').replace(/_/g, ' ')} />
                      <Info label="Created" value={safeDate(selected.reported_at ?? selected.created_at)} />
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-3">
                      <Section title="Evidence" icon={Upload}>
                        <div className="space-y-2">
                          {(selected.evidence ?? []).slice(0, 4).map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                              <span className="truncate">{item.file_name ?? item.evidence_type}</span>
                              <Badge variant="outline">{item.evidence_type}</Badge>
                            </div>
                          ))}
                          {(selected.evidence ?? []).length === 0 && <EmptyLine text="No evidence attached yet." />}
                        </div>
                      </Section>
                      <Section title="Linked Records" icon={Link2}>
                        <div className="space-y-2">
                          <LinkedLine label="Work order" value={selected.assigned_work_order_id} />
                          <LinkedLine label="Estimate" value={selected.linked_estimate_id} />
                          <LinkedLine label="Route" value={selected.current_route_type?.replace(/_/g, ' ')} />
                        </div>
                      </Section>
                      <Section title="Classification" icon={ShieldCheck}>
                        <div className="space-y-2 text-sm">
                          <p className="font-semibold text-slate-900">
                            {selected.confirmed_ata_code || selected.suggested_ata_code
                              ? `ATA ${selected.confirmed_ata_code ?? selected.suggested_ata_code}`
                              : 'ATA needs review'}
                          </p>
                          <p className="text-slate-600">
                            {selected.confirmed_jasc_code || selected.suggested_jasc_code
                              ? `JASC ${selected.confirmed_jasc_code ?? selected.suggested_jasc_code}`
                              : 'JASC not selected'}
                          </p>
                          <Badge variant="outline">{selected.classification_status ?? 'unclassified'}</Badge>
                        </div>
                      </Section>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
                  <Card className="rounded-lg border-slate-200 bg-white shadow-none">
                    <CardContent className="p-5">
                      <h3 className="text-lg font-bold text-slate-950">Decision Actions</h3>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <RouteButton label="Add to Work Order" detail="Link active WO or create setup" onClick={() => openRoute('existing_work_order')} />
                        <RouteButton label="Create Estimate" detail="Quote owner approval scope" onClick={() => openRoute('estimate')} />
                        <RouteButton label="Ask Owner Approval" detail="Share sanitized summary" onClick={() => openRoute('owner_approval')} />
                        <RouteButton label="Defer" detail="Track with reason and date" onClick={() => openRoute('defer')} />
                        <RouteButton label="Resolve / No Action" detail="Close with required reason" onClick={() => openRoute('close')} />
                        <RouteButton label="Duplicate" detail="Link to master squawk" onClick={() => openRoute('duplicate')} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-lg border-slate-200 bg-white shadow-none">
                    <CardContent className="p-5">
                      <h3 className="text-lg font-bold text-slate-950">Activity</h3>
                      <div className="mt-4 space-y-3">
                        {(selected.status_history ?? []).slice(0, 5).map((item) => (
                          <div key={item.id} className="rounded-md border border-slate-200 px-3 py-2">
                            <p className="text-sm font-semibold text-slate-900">{labelForStatus(item.to_status)}</p>
                            <p className="text-xs text-slate-500">{safeDate(item.created_at)}</p>
                            {item.reason && <p className="mt-1 text-sm text-slate-600">{item.reason}</p>}
                          </div>
                        ))}
                        {(selected.status_history ?? []).length === 0 && <EmptyLine text="No status history loaded yet." />}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <Card className="rounded-lg border-slate-200 bg-white shadow-none">
                <CardContent className="p-10 text-center text-sm text-slate-500">Select a squawk from the queue.</CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Add Squawk - AI First Capture</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Aircraft</Label>
                  <Select
                    value={form.aircraft_id}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, aircraft_id: value }))}
                    disabled={mode === 'aircraft'}
                  >
                    <SelectTrigger><SelectValue placeholder="Select aircraft" /></SelectTrigger>
                    <SelectContent>
                      {aircraftOptions.map((aircraft) => (
                        <SelectItem key={aircraft.id} value={aircraft.id}>
                          {aircraft.tail_number} {aircraft.model ? `- ${aircraft.model}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Owner Visibility</Label>
                  <Select
                    value={form.owner_visible ? 'owner' : 'internal'}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, owner_visible: value === 'owner' }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal only</SelectItem>
                      <SelectItem value="owner">Owner visible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                  <Mic className="h-4 w-4" /> Dictation / Prompt
                </div>
                <Textarea
                  value={form.transcript}
                  onChange={(event) => setForm((prev) => ({ ...prev, transcript: event.target.value }))}
                  placeholder="Oil residue near #2 valve cover. Looks like gasket seep. Needs inspection before release."
                  className="mt-3 min-h-[120px] border-blue-200 bg-white"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline">
                    <Camera className="h-4 w-4" /> Photo
                  </Button>
                  <Button type="button" size="sm" variant="outline">
                    <Upload className="h-4 w-4" /> File
                  </Button>
                  <Button type="button" size="sm" onClick={generateDraft} disabled={drafting}>
                    <Bot className="h-4 w-4" /> {drafting ? 'Drafting...' : 'Generate AI Draft'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Evidence Note</Label>
                <Textarea
                  value={form.evidence_note}
                  onChange={(event) => setForm((prev) => ({ ...prev, evidence_note: event.target.value }))}
                  placeholder="Photo, transcript, paper/OCR, or owner-submitted context retained with the squawk."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" value={form.title} onChange={(value) => setForm((prev) => ({ ...prev, title: value }))} />
                <Field label="Category" value={form.category} onChange={(value) => setForm((prev) => ({ ...prev, category: value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(value) => setForm((prev) => ({ ...prev, severity: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['low', 'medium', 'normal', 'high', 'critical', 'grounding', 'needs_review'].map((item) => (
                        <SelectItem key={item} value={item}>{labelForSeverity(item)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="ATA" value={form.suggested_ata_code} onChange={(value) => setForm((prev) => ({ ...prev, suggested_ata_code: value }))} />
                  <Field label="JASC" value={form.suggested_jasc_code} onChange={(value) => setForm((prev) => ({ ...prev, suggested_jasc_code: value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="min-h-[160px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Owner Summary</Label>
                <Textarea
                  value={form.owner_summary}
                  onChange={(event) => setForm((prev) => ({ ...prev, owner_summary: event.target.value }))}
                  placeholder="Sanitized owner-facing summary if shared."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createSquawk} disabled={saving}>{saving ? 'Saving...' : 'Create Squawk'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Edit Squawk</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" value={editForm.title} onChange={(value) => setEditForm((prev) => ({ ...prev, title: value }))} />
              <Field label="Category" value={editForm.category} onChange={(value) => setEditForm((prev) => ({ ...prev, category: value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Severity" value={editForm.severity} values={['low', 'medium', 'normal', 'high', 'critical', 'grounding', 'needs_review']} onChange={(value) => setEditForm((prev) => ({ ...prev, severity: value }))} formatter={labelForSeverity} />
              <SelectField label="Status" value={editForm.status} values={Object.keys(statusMeta)} onChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))} formatter={labelForStatus} />
              <SelectField label="Owner Visibility" value={editForm.owner_visible ? 'owner' : 'internal'} values={['internal', 'owner']} onChange={(value) => setEditForm((prev) => ({ ...prev, owner_visible: value === 'owner' }))} formatter={(value) => value === 'owner' ? 'Owner visible' : 'Internal only'} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Edit Reason</Label>
              <Input value={editForm.reason} onChange={(event) => setEditForm((prev) => ({ ...prev, reason: event.target.value }))} placeholder="Required for revision history" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Edit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Route Squawk</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <SelectField
              label="Route"
              value={routeForm.route_type}
              values={['existing_work_order', 'new_work_order', 'estimate', 'owner_approval', 'defer', 'close', 'duplicate', 'no_action']}
              onChange={(value) => setRouteForm((prev) => ({ ...prev, route_type: value }))}
              formatter={(value) => value.replace(/_/g, ' ')}
            />
            {['existing_work_order', 'duplicate'].includes(routeForm.route_type) && (
              <Field
                label={routeForm.route_type === 'duplicate' ? 'Master Squawk ID' : 'Target Record ID'}
                value={routeForm.target_record_id}
                onChange={(value) => setRouteForm((prev) => ({ ...prev, target_record_id: value }))}
              />
            )}
            <div className="space-y-2">
              <Label>Reason / Notes</Label>
              <Textarea value={routeForm.reason} onChange={(event) => setRouteForm((prev) => ({ ...prev, reason: event.target.value }))} />
            </div>
            <SelectField
              label="Owner Visibility"
              value={routeForm.owner_visible ? 'owner' : 'internal'}
              values={['internal', 'owner']}
              onChange={(value) => setRouteForm((prev) => ({ ...prev, owner_visible: value === 'owner' }))}
              formatter={(value) => value === 'owner' ? 'Owner visible' : 'Internal only'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteOpen(false)}>Cancel</Button>
            <Button onClick={submitRoute} disabled={saving}>{saving ? 'Routing...' : 'Route Squawk'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'red' | 'indigo' | 'amber' | 'slate' | 'purple' }) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
    purple: 'bg-purple-50 text-purple-700',
  }
  return (
    <Card className="rounded-lg border-slate-200 bg-white shadow-none">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className={cn('mt-3 inline-flex rounded-md px-3 py-1 text-2xl font-bold', toneClasses[tone])}>{value}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta[status] ?? statusMeta.open
  return <Badge className={cn('border-0 capitalize', meta.className)}>{meta.label}</Badge>
}

function SeverityBadge({ severity }: { severity: string }) {
  const meta = severityMeta[severity] ?? severityMeta.normal
  return <Badge className={cn('border-0', meta.className)}>{meta.label}</Badge>
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Icon className="h-4 w-4" /> {title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500">{text}</p>
}

function LinkedLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="max-w-[180px] truncate font-semibold text-slate-950">{value ?? 'Not linked'}</span>
    </div>
  )
}

function RouteButton({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50">
      <p className="text-sm font-bold text-slate-950">{label}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </button>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function SelectField({
  label,
  value,
  values,
  onChange,
  formatter,
}: {
  label: string
  value: string
  values: string[]
  onChange: (value: string) => void
  formatter: (value: string) => string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>{formatter(item)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
