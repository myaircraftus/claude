'use client'

/**
 * Squawks — persona-aware redesign.
 *
 * Two distinct experiences off one data set (see SquawksWorkspace):
 *  - OWNER  → report + track. Mobile-first list of their squawks + a read-only
 *    timeline, plus a fast "Report a squawk" capture (aircraft + what's wrong +
 *    plain-language severity). Owners never see classify / route / close — those
 *    are regulated, shop-authoritative acts.
 *  - SHOP   → triage worklist. Responsive master-detail (list pinned beside the
 *    detail on desktop, full-screen drill-in on mobile), classify (ATA/JASC),
 *    route to estimate / work order, defer, resolve, with audit timeline.
 *
 * Grounding/critical is surfaced as the AOG signal. Status/severity render via
 * the shared StatusBadge so colors live in one place.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, Bot, CheckCircle2, Clock3, FileText, Link2, Loader2,
  Pencil, Plane, Plus, Search, ShieldCheck, Wrench,
} from 'lucide-react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge, type StatusMap } from '@/components/shared/status-badge'
import { AtaJascSelector } from '@/components/aviation/AtaJascSelector'
import { EMPTY_ATA_JASC, hasAtaJasc, type AtaJascValue } from '@/lib/aviation/ata-jasc'
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
  owner_visible?: boolean | null
  owner_summary?: string | null
  current_route_type?: string | null
  assigned_work_order_id?: string | null
  linked_estimate_id?: string | null
  reported_at?: string | null
  resolved_at?: string | null
  closure_reason?: string | null
  closure_notes?: string | null
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
  status_history?: Array<{ id: string; from_status?: string | null; to_status: string; reason?: string | null; created_at: string }>
}

type Props = {
  mode: 'global' | 'aircraft'
  initialSquawks: SquawkRecord[]
  aircraftOptions: AircraftOption[]
  lockedAircraft?: AircraftOption | null
  /** Owner persona — read-only tracking + report only; no triage controls. */
  isOwner?: boolean
}

/* ─────────────────────────── status / severity tokens ─────────────────────── */

const SQUAWK_STATUS: StatusMap = {
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  open: { label: 'Open', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  acknowledged: { label: 'Acknowledged', pill: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  needs_review: { label: 'Needs review', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  high_priority: { label: 'High priority', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  routed_to_estimate: { label: 'Estimate', pill: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  awaiting_owner_approval: { label: 'Awaiting approval', pill: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  added_to_work_order: { label: 'In work order', pill: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  in_work_order: { label: 'In work order', pill: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  in_progress: { label: 'In progress', pill: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  waiting_for_parts: { label: 'Waiting on parts', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  deferred: { label: 'Deferred', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  resolved: { label: 'Resolved', pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  closed_duplicate: { label: 'Duplicate', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  closed_not_reproducible: { label: 'Not reproducible', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  closed_owner_declined: { label: 'Owner declined', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  archived: { label: 'Archived', pill: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
}

const SQUAWK_SEVERITY: StatusMap = {
  low: { label: 'Low', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  minor: { label: 'Minor', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  cosmetic: { label: 'Cosmetic', pill: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  normal: { label: 'Normal', pill: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  medium: { label: 'Medium', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  high: { label: 'High', pill: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  urgent: { label: 'Urgent', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  critical: { label: 'Critical', pill: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  grounding: { label: 'Grounding', pill: 'bg-red-100 text-red-800', dot: 'bg-red-600' },
  needs_review: { label: 'Needs review', pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
}

const CLOSED_STATUSES = ['resolved', 'closed_duplicate', 'closed_not_reproducible', 'closed_owner_declined', 'archived']
const AOG_SEVERITIES = ['high', 'urgent', 'critical', 'grounding']

const isClosed = (s: SquawkRecord) => CLOSED_STATUSES.includes(s.status)
const isAog = (s: SquawkRecord) => AOG_SEVERITIES.includes(s.severity)

function safeDate(value?: string | null) {
  if (!value) return '—'
  try { return formatDateTime(value) } catch { return '—' }
}

function deriveTitle(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= 70) return clean
  return clean.slice(0, 67).trimEnd() + '…'
}

/** Plain-language status for owners (they shouldn't parse shop jargon). */
function ownerStatusLine(s: SquawkRecord): string {
  if (s.status === 'resolved') return 'Resolved'
  if (CLOSED_STATUSES.includes(s.status)) return 'Closed'
  if (s.status === 'deferred') return 'Deferred'
  if (['added_to_work_order', 'in_work_order', 'in_progress', 'waiting_for_parts'].includes(s.status)) return 'In work'
  if (['routed_to_estimate', 'awaiting_owner_approval'].includes(s.status)) return 'Estimate pending'
  return 'Reported — shop reviewing'
}

/* ──────────────────────────────── entry point ─────────────────────────────── */

export function SquawksWorkspace(props: Props) {
  return props.isOwner ? <OwnerSquawks {...props} /> : <ShopSquawks {...props} />
}

/* ════════════════════════════════ OWNER VIEW ══════════════════════════════════ */

const OWNER_SEVERITIES: { value: string; label: string; help: string; cls: string }[] = [
  { value: 'grounding', label: 'Looks unsafe — may not be safe to fly', help: 'The shop will confirm airworthiness.', cls: 'data-[on=true]:border-red-400 data-[on=true]:bg-red-50' },
  { value: 'medium', label: 'Should be fixed soon', help: 'Flyable but needs attention.', cls: 'data-[on=true]:border-amber-400 data-[on=true]:bg-amber-50' },
  { value: 'low', label: 'Minor / note it', help: 'Cosmetic or next-visit.', cls: 'data-[on=true]:border-slate-400 data-[on=true]:bg-muted' },
]

function OwnerSquawks({ mode, initialSquawks, aircraftOptions, lockedAircraft }: Props) {
  const [squawks, setSquawks] = useState(() => initialSquawks.filter((s) => s.owner_visible !== false))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ aircraft_id: lockedAircraft?.id ?? '', complaint: '', severity: 'medium' })

  const selected = selectedId ? squawks.find((s) => s.id === selectedId) ?? null : null

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return squawks.filter((s) => {
      if (!needle) return true
      return [s.title, s.description, s.aircraft?.tail_number].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [squawks, query])

  const openCount = squawks.filter((s) => !isClosed(s)).length

  async function submitReport() {
    if (!form.aircraft_id) { toast.error('Pick which aircraft this is about.') ; return }
    if (!form.complaint.trim()) { toast.error('Describe what you noticed.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/squawks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: form.aircraft_id,
          title: deriveTitle(form.complaint),
          description: form.complaint.trim(),
          severity: form.severity,
          source: 'owner_portal',
          owner_visible: true,
          owner_summary: form.complaint.trim(),
          source_context: 'owner_report',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not submit your report')
      setSquawks((prev) => [data, ...prev])
      setReportOpen(false)
      setForm({ aircraft_id: lockedAircraft?.id ?? '', complaint: '', severity: 'medium' })
      toast.success('Reported. The shop will review and confirm whether the aircraft is airworthy.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit your report')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      <div className="flex flex-1 overflow-hidden">
        {/* List */}
        <div className={cn(
          'flex-col border-r border-border bg-background w-full lg:w-[400px] lg:flex-shrink-0',
          selected ? 'hidden lg:flex' : 'flex',
        )}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground leading-tight">
                {mode === 'aircraft' && lockedAircraft ? `${lockedAircraft.tail_number} squawks` : 'Squawks'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{openCount} open</p>
            </div>
            <Button size="sm" onClick={() => setReportOpen(true)} className="h-8 rounded-lg px-3">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Report
            </Button>
          </div>

          <div className="px-5 pb-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your squawks…"
                aria-label="Search squawks"
                className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {filtered.length === 0 ? (
              <ListEmpty
                title={query ? 'No matching squawks' : 'No squawks yet'}
                desc={query ? 'Try a different search.' : 'Notice something wrong with your aircraft? Tap Report.'}
              />
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'block w-full text-left rounded-xl border bg-background px-3.5 py-3 transition-all',
                    selected?.id === s.id ? 'border-brand-500/40 bg-brand-50/60 ring-1 ring-brand-500/30' : 'border-border hover:border-foreground/20 hover:shadow-sm',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                      <Plane className="h-3 w-3 text-muted-foreground" />
                      {s.aircraft?.tail_number ?? 'Aircraft'}
                    </span>
                    {isAog(s) && !isClosed(s) && <StatusBadge map={SQUAWK_SEVERITY} status={s.severity} className="shrink-0" />}
                  </div>
                  <p className="text-[13px] text-foreground line-clamp-2 mt-1.5">{s.title}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                    <span>{safeDate(s.reported_at ?? s.created_at)}</span>
                    <span className="font-medium text-foreground/80">{ownerStatusLine(s)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail (read-only) */}
        <div className={cn('flex-1 flex-col min-w-0 bg-background overflow-hidden', selected ? 'flex' : 'hidden lg:flex')}>
          {selected ? (
            <OwnerDetail squawk={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <AlertTriangle className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Select a squawk</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Pick one to see its status and the shop&apos;s updates, or report a new issue.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Report modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Report a squawk</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Aircraft</Label>
              <Select
                value={form.aircraft_id}
                onValueChange={(v) => setForm((f) => ({ ...f, aircraft_id: v }))}
                disabled={mode === 'aircraft'}
              >
                <SelectTrigger><SelectValue placeholder="Which aircraft?" /></SelectTrigger>
                <SelectContent>
                  {aircraftOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.tail_number}{a.model ? ` · ${a.model}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What did you notice?</Label>
              <Textarea
                autoFocus
                value={form.complaint}
                onChange={(e) => setForm((f) => ({ ...f, complaint: e.target.value }))}
                placeholder="What's wrong, and when did it start? e.g. 'Right brake feels soft and pulls left when taxiing — started today.'"
                className="min-h-[120px]"
              />
              <p className="text-[11px] text-muted-foreground">A symptom + when it happens helps the shop the most. No jargon needed.</p>
            </div>
            <div className="space-y-1.5">
              <Label>How serious does it seem?</Label>
              <div className="grid gap-2">
                {OWNER_SEVERITIES.map((opt) => {
                  const on = form.severity === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-on={on}
                      onClick={() => setForm((f) => ({ ...f, severity: opt.value }))}
                      className={cn(
                        'w-full text-left rounded-lg border px-3 py-2.5 transition-colors border-border hover:bg-muted/40',
                        opt.cls,
                      )}
                    >
                      <p className="text-[13px] font-medium text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{opt.help}</p>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">This is your read — the shop confirms the official airworthiness status.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitReport} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function OwnerDetail({ squawk, onBack }: { squawk: SquawkRecord; onBack: () => void }) {
  const resolved = squawk.status === 'resolved' || Boolean(squawk.resolved_at)
  const ownerEvidence = (squawk.evidence ?? []).filter((e) => e.owner_visible !== false)
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b border-border px-5 py-3 flex items-center gap-2">
        <button onClick={onBack} className="lg:hidden -ml-1 p-1 rounded hover:bg-muted" aria-label="Back to squawks">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">{squawk.aircraft?.tail_number ?? 'Aircraft'}</p>
          <h2 className="text-[15px] font-semibold text-foreground truncate">{squawk.title}</h2>
        </div>
        {isAog(squawk) && !isClosed(squawk) && <StatusBadge map={SQUAWK_SEVERITY} status={squawk.severity} />}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* airworthiness reassurance line */}
        <div className={cn(
          'rounded-xl border px-4 py-3',
          isAog(squawk) && !isClosed(squawk) ? 'border-red-200 bg-red-50' : resolved ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-muted/30',
        )}>
          <p className="text-[13px] font-medium text-foreground">{ownerStatusLine(squawk)}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {resolved
              ? 'The shop has resolved this item.'
              : isAog(squawk)
                ? 'Flagged as possibly unsafe — the shop will confirm the airworthiness status.'
                : 'The shop has your report and will update you here.'}
          </p>
        </div>

        <DetailField label="What you reported">
          <p className="text-[13px] text-foreground whitespace-pre-wrap">{squawk.description || squawk.owner_summary || squawk.title}</p>
        </DetailField>

        {resolved && (squawk.closure_notes || squawk.closure_reason) && (
          <DetailField label="What the shop did">
            <p className="text-[13px] text-foreground whitespace-pre-wrap">{squawk.closure_notes || squawk.closure_reason}</p>
            {squawk.resolved_at && <p className="text-[11px] text-muted-foreground mt-1">Resolved {safeDate(squawk.resolved_at)}</p>}
          </DetailField>
        )}

        {ownerEvidence.length > 0 && (
          <DetailField label="Photos & files">
            <div className="space-y-2">
              {ownerEvidence.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px] text-foreground">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{e.file_name ?? e.evidence_type}</span>
                </div>
              ))}
            </div>
          </DetailField>
        )}

        <DetailField label="Activity">
          {(squawk.status_history ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">Reported {safeDate(squawk.reported_at ?? squawk.created_at)}.</p>
          ) : (
            <ol className="space-y-2.5">
              {(squawk.status_history ?? []).slice().reverse().map((h) => (
                <li key={h.id} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-foreground">{SQUAWK_STATUS[h.to_status]?.label ?? h.to_status.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-muted-foreground">{safeDate(h.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DetailField>
      </div>
    </div>
  )
}

/* ════════════════════════════════ SHOP VIEW ═══════════════════════════════════ */

const SHOP_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'grounded', label: 'Grounded' },
  { value: 'approval', label: 'Approval' },
  { value: 'deferred', label: 'Deferred' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

const SEVERITY_OPTIONS = ['low', 'medium', 'normal', 'high', 'critical', 'grounding']

function ShopSquawks({ mode, initialSquawks, aircraftOptions, lockedAircraft }: Props) {
  const router = useTenantRouter()
  const [squawks, setSquawks] = useState(initialSquawks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('open')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [routeOpen, setRouteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)

  const [form, setForm] = useState({
    aircraft_id: lockedAircraft?.id ?? '', transcript: '', title: '', description: '',
    category: 'General', severity: 'normal', owner_visible: false, owner_summary: '',
  })
  const [editForm, setEditForm] = useState({ title: '', description: '', category: '', severity: 'normal', status: 'open', owner_visible: false, reason: '' })
  const [routeForm, setRouteForm] = useState({ route_type: 'existing_work_order', target_record_id: '', reason: '', owner_visible: false })
  const [ataJasc, setAtaJasc] = useState<AtaJascValue>({ ...EMPTY_ATA_JASC })

  const selected = selectedId ? squawks.find((s) => s.id === selectedId) ?? null : null

  const counts = useMemo(() => ({
    open: squawks.filter((s) => !isClosed(s)).length,
    grounded: squawks.filter((s) => isAog(s) && !isClosed(s)).length,
    deferred: squawks.filter((s) => s.status === 'deferred').length,
    linked: squawks.filter((s) => s.assigned_work_order_id || s.linked_estimate_id).length,
  }), [squawks])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const byFilter = squawks.filter((s) => {
      switch (filter) {
        case 'open': return !isClosed(s)
        case 'grounded': return isAog(s) && !isClosed(s)
        case 'approval': return ['awaiting_owner_approval', 'routed_to_estimate'].includes(s.status)
        case 'deferred': return s.status === 'deferred'
        case 'closed': return isClosed(s)
        default: return true
      }
    })
    const searched = !needle ? byFilter : byFilter.filter((s) =>
      [s.title, s.description, s.category, s.aircraft?.tail_number, s.reporter?.full_name].filter(Boolean).join(' ').toLowerCase().includes(needle))
    // AOG first, then open before closed, then newest.
    return searched.slice().sort((a, b) => {
      if (isAog(a) !== isAog(b)) return isAog(a) ? -1 : 1
      if (isClosed(a) !== isClosed(b)) return isClosed(a) ? 1 : -1
      return (b.reported_at ?? b.created_at).localeCompare(a.reported_at ?? a.created_at)
    })
  }, [squawks, filter, query])

  async function generateDraft() {
    if (!form.transcript.trim() && !form.description.trim()) { toast.error('Enter squawk text first.'); return }
    setDrafting(true)
    try {
      const aircraft = aircraftOptions.find((a) => a.id === form.aircraft_id) ?? lockedAircraft
      const res = await fetch('/api/squawks/structure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: form.transcript || form.description, aircraft, tail_number: aircraft?.tail_number }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate draft')
      setForm((p) => ({
        ...p,
        title: data.title ?? p.title,
        description: data.description ?? p.description,
        category: data.category ?? p.category,
        severity: (data.severity ?? p.severity).toLowerCase(),
      }))
      toast.success('Draft ready for review.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate draft')
    } finally { setDrafting(false) }
  }

  async function createSquawk() {
    if (!form.aircraft_id) { toast.error('Select an aircraft.'); return }
    if (!form.title.trim()) { toast.error('A title is required.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/squawks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: form.aircraft_id, title: form.title, description: form.description,
          category: form.category, severity: form.severity, source: form.transcript ? 'dictation' : 'manual',
          transcript: form.transcript, owner_visible: form.owner_visible, owner_summary: form.owner_summary,
          source_context: mode === 'aircraft' ? 'aircraft_workspace' : 'global_queue',
          confirmed_ata_code: ataJasc.ata_code, confirmed_jasc_code: ataJasc.jasc_code,
          classification_status: hasAtaJasc(ataJasc) ? 'classified' : 'unclassified',
          human_verified: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create squawk')
      setSquawks((prev) => [data, ...prev])
      setSelectedId(data.id)
      setCreateOpen(false)
      setForm({ aircraft_id: lockedAircraft?.id ?? '', transcript: '', title: '', description: '', category: 'General', severity: 'normal', owner_visible: false, owner_summary: '' })
      setAtaJasc({ ...EMPTY_ATA_JASC })
      toast.success('Squawk created.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create squawk')
    } finally { setSaving(false) }
  }

  function openEdit() {
    if (!selected) return
    setEditForm({
      title: selected.title, description: selected.description ?? '', category: selected.category ?? '',
      severity: selected.severity, status: selected.status, owner_visible: Boolean(selected.owner_visible), reason: '',
    })
    setEditOpen(true)
  }

  async function saveEdit() {
    if (!selected) return
    if (!editForm.reason.trim()) { toast.error('An edit reason is required for the audit trail.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/squawks/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, edit_reason: editForm.reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update squawk')
      setSquawks((prev) => prev.map((s) => (s.id === selected.id ? data : s)))
      setEditOpen(false)
      toast.success('Squawk updated.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update squawk')
    } finally { setSaving(false) }
  }

  function openRoute(routeType: string) {
    setRouteForm({ route_type: routeType, target_record_id: '', reason: '', owner_visible: routeType === 'owner_approval' })
    setRouteOpen(true)
  }

  async function submitRoute() {
    if (!selected) return
    if (['defer', 'close', 'duplicate', 'no_action'].includes(routeForm.route_type) && !routeForm.reason.trim()) {
      toast.error('A reason is required for this action.'); return
    }
    setSaving(true)
    try {
      let targetRecordId = routeForm.target_record_id || null
      if (routeForm.route_type === 'estimate') {
        const estRes = await fetch('/api/estimates', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ aircraft_id: selected.aircraft_id, service_type: selected.title, customer_notes: selected.description, internal_notes: `Created from squawk ${selected.id}`, linked_squawk_ids: [selected.id], status: 'draft' }),
        })
        const est = await estRes.json()
        if (!estRes.ok) throw new Error(est.error ?? 'Failed to create estimate')
        targetRecordId = est.id
      }
      const res = await fetch(`/api/squawks/${selected.id}/route`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route_type: routeForm.route_type, target_record_id: targetRecordId, reason: routeForm.reason, owner_visible: routeForm.owner_visible }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to route squawk')
      setSquawks((prev) => prev.map((s) => (s.id === selected.id ? data.squawk : s)))
      setRouteOpen(false)
      toast.success('Squawk routed.')
      if (routeForm.route_type === 'estimate' && targetRecordId) router.push(`/estimates/${targetRecordId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to route squawk')
    } finally { setSaving(false) }
  }

  const statItems = [
    { label: 'Open', value: counts.open, cls: 'text-blue-600', filter: 'open' },
    { label: 'Grounded', value: counts.grounded, cls: 'text-red-600', filter: 'grounded' },
    { label: 'Deferred', value: counts.deferred, cls: 'text-slate-600', filter: 'deferred' },
    { label: 'All', value: squawks.length, cls: 'text-foreground', filter: 'all' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/20">
      <div className="flex flex-1 overflow-hidden">
        {/* List / triage queue */}
        <div className={cn(
          'flex-col border-r border-border bg-background w-full lg:w-[400px] lg:flex-shrink-0',
          selected ? 'hidden lg:flex' : 'flex',
        )}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground leading-tight">
                {mode === 'aircraft' && lockedAircraft ? `${lockedAircraft.tail_number} squawks` : 'Squawks'}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{counts.open} open · {counts.grounded} grounded</p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8 rounded-lg px-3">
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New
            </Button>
          </div>

          {/* stat chips — tap to filter */}
          <div className="px-5 pb-3">
            <div className="grid grid-cols-4 gap-2">
              {statItems.map((s) => {
                const active = filter === s.filter
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setFilter(s.filter)}
                    aria-pressed={active}
                    className={cn('rounded-xl border bg-background px-1.5 py-2.5 text-center transition-colors',
                      active ? 'border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/50' : 'border-border hover:border-foreground/25')}
                  >
                    <p className={cn('text-lg font-semibold leading-none tabular-nums', s.cls)}>{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-none truncate">{s.label}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-5 pb-3 space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search squawk, tail, reporter…"
                aria-label="Search squawks"
                className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
              {SHOP_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn('shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors whitespace-nowrap',
                    filter === f.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {filtered.length === 0 ? (
              <ListEmpty title="No squawks in this view" desc="Try a different filter." />
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn('block w-full text-left rounded-xl border bg-background px-3.5 py-3 transition-all',
                    selected?.id === s.id ? 'border-brand-500/40 bg-brand-50/60 ring-1 ring-brand-500/30' : 'border-border hover:border-foreground/20 hover:shadow-sm')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground">
                      <Plane className="h-3 w-3 text-muted-foreground" />
                      {s.aircraft?.tail_number ?? 'Aircraft'}
                    </span>
                    <StatusBadge map={SQUAWK_SEVERITY} status={s.severity} className="shrink-0" />
                  </div>
                  <p className="text-[13px] text-foreground line-clamp-2 mt-1.5">{s.title}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <StatusBadge map={SQUAWK_STATUS} status={s.status} />
                    <span className="text-[11px] text-muted-foreground shrink-0">{safeDate(s.reported_at ?? s.created_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail */}
        <div className={cn('flex-1 flex-col min-w-0 bg-background overflow-hidden', selected ? 'flex' : 'hidden lg:flex')}>
          {selected ? (
            <ShopDetail
              squawk={selected}
              onBack={() => setSelectedId(null)}
              onEdit={openEdit}
              onRoute={openRoute}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Wrench className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">Select a squawk to triage</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">Assess airworthiness, classify, and route to an estimate or work order.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New squawk</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto px-0.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Aircraft</Label>
                <Select value={form.aircraft_id} onValueChange={(v) => setForm((p) => ({ ...p, aircraft_id: v }))} disabled={mode === 'aircraft'}>
                  <SelectTrigger><SelectValue placeholder="Select aircraft" /></SelectTrigger>
                  <SelectContent>
                    {aircraftOptions.map((a) => (<SelectItem key={a.id} value={a.id}>{a.tail_number}{a.model ? ` · ${a.model}` : ''}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm((p) => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((v) => (<SelectItem key={v} value={v}>{SQUAWK_SEVERITY[v]?.label ?? v}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground"><Bot className="h-4 w-4" /> Dictate or paste, then draft</div>
              <Textarea
                value={form.transcript}
                onChange={(e) => setForm((p) => ({ ...p, transcript: e.target.value }))}
                placeholder="e.g. Oil residue near #2 valve cover, looks like a gasket seep. Inspect before release."
                className="mt-2 min-h-[80px] bg-background"
              />
              <Button type="button" size="sm" className="mt-2" onClick={generateDraft} disabled={drafting}>
                {drafting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 mr-1.5" />}
                {drafting ? 'Drafting…' : 'Generate draft'}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="min-h-[100px]" />
            </div>
            <AtaJascSelector value={ataJasc} onChange={(v) => setAtaJasc(v)} aircraftId={form.aircraft_id || null} suggestText={form.description} label="ATA / JASC classification" compact />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={createSquawk} disabled={saving}>{saving ? 'Saving…' : 'Create squawk'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit squawk</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Title</Label><Input value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Category</Label><Input value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={editForm.severity} onValueChange={(v) => setEditForm((p) => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITY_OPTIONS.map((v) => (<SelectItem key={v} value={v}>{SQUAWK_SEVERITY[v]?.label ?? v}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(SQUAWK_STATUS).map((v) => (<SelectItem key={v} value={v}>{SQUAWK_STATUS[v].label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Edit reason</Label><Input value={editForm.reason} onChange={(e) => setEditForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Required for the revision history" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Route */}
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Route squawk</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={routeForm.route_type} onValueChange={(v) => setRouteForm((p) => ({ ...p, route_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[['existing_work_order', 'Add to existing work order'], ['estimate', 'Create estimate'], ['owner_approval', 'Ask owner approval'], ['defer', 'Defer'], ['close', 'Resolve / no action'], ['duplicate', 'Mark duplicate']].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {['existing_work_order', 'duplicate'].includes(routeForm.route_type) && (
              <div className="space-y-1.5">
                <Label>{routeForm.route_type === 'duplicate' ? 'Master squawk ID' : 'Work order ID'}</Label>
                <Input value={routeForm.target_record_id} onChange={(e) => setRouteForm((p) => ({ ...p, target_record_id: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1.5"><Label>Reason / notes</Label><Textarea value={routeForm.reason} onChange={(e) => setRouteForm((p) => ({ ...p, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitRoute} disabled={saving}>{saving ? 'Working…' : 'Apply'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShopDetail({ squawk, onBack, onEdit, onRoute }: {
  squawk: SquawkRecord
  onBack: () => void
  onEdit: () => void
  onRoute: (routeType: string) => void
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 border-b border-border px-5 py-3 flex items-center gap-2">
        <button onClick={onBack} className="lg:hidden -ml-1 p-1 rounded hover:bg-muted" aria-label="Back to queue">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">{squawk.aircraft?.tail_number ?? 'Aircraft'} · {safeDate(squawk.reported_at ?? squawk.created_at)}</p>
          <h2 className="text-[15px] font-semibold text-foreground truncate">{squawk.title}</h2>
        </div>
        <Button size="sm" variant="outline" className="h-8" onClick={onEdit}><Pencil className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Edit</span></Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge map={SQUAWK_STATUS} status={squawk.status} />
          <StatusBadge map={SQUAWK_SEVERITY} status={squawk.severity} />
          {squawk.owner_visible && <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">Owner visible</span>}
        </div>

        {/* Two columns: as-reported vs shop work */}
        <div className="grid gap-4 lg:grid-cols-2">
          <DetailField label="As reported">
            <p className="text-[13px] text-foreground whitespace-pre-wrap">{squawk.description || 'No description recorded.'}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <Meta label="Reporter" value={squawk.reporter?.full_name ?? '—'} />
              <Meta label="Source" value={(squawk.source ?? 'manual').replace(/_/g, ' ')} />
              <Meta label="Category" value={squawk.category ?? '—'} />
              <Meta label="Aircraft" value={squawk.aircraft?.tail_number ?? '—'} />
            </div>
          </DetailField>

          <DetailField label="Shop work">
            <div className="grid grid-cols-2 gap-2 text-[12px]">
              <Meta label="ATA" value={squawk.confirmed_ata_code || squawk.suggested_ata_code || '—'} />
              <Meta label="JASC" value={squawk.confirmed_jasc_code || squawk.suggested_jasc_code || '—'} />
              <Meta label="Classification" value={squawk.classification_status ?? 'unclassified'} />
              <Meta label="Route" value={squawk.current_route_type?.replace(/_/g, ' ') ?? '—'} />
              <Meta label="Work order" value={squawk.assigned_work_order_id ? 'Linked' : '—'} />
              <Meta label="Estimate" value={squawk.linked_estimate_id ? 'Linked' : '—'} />
            </div>
          </DetailField>
        </div>

        {/* Triage actions */}
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Triage</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton icon={Wrench} label="Add to work order" detail="Attach as a non-routine line" onClick={() => onRoute('existing_work_order')} />
            <ActionButton icon={FileText} label="Create estimate" detail="Quote for owner approval" onClick={() => onRoute('estimate')} />
            <ActionButton icon={ShieldCheck} label="Ask owner approval" detail="Share a sanitized summary" onClick={() => onRoute('owner_approval')} />
            <ActionButton icon={Clock3} label="Defer" detail="Track with reason + date" onClick={() => onRoute('defer')} />
            <ActionButton icon={CheckCircle2} label="Resolve / no action" detail="Close with corrective action" onClick={() => onRoute('close')} />
            <ActionButton icon={Link2} label="Mark duplicate" detail="Link to the master squawk" onClick={() => onRoute('duplicate')} />
          </div>
        </div>

        {/* Activity */}
        <DetailField label="Activity">
          {(squawk.status_history ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No status changes yet.</p>
          ) : (
            <ol className="space-y-2.5">
              {(squawk.status_history ?? []).slice().reverse().slice(0, 8).map((h) => (
                <li key={h.id} className="flex gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-foreground">{SQUAWK_STATUS[h.to_status]?.label ?? h.to_status.replace(/_/g, ' ')}</p>
                    <p className="text-[11px] text-muted-foreground">{safeDate(h.created_at)}</p>
                    {h.reason && <p className="text-[12px] text-foreground/80 mt-0.5">{h.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DetailField>
      </div>
    </div>
  )
}

/* ───────────────────────────────── shared bits ────────────────────────────── */

function ListEmpty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-11 h-11 rounded-2xl bg-muted flex items-center justify-center mb-3">
        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{desc}</p>
    </div>
  )
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</h3>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</p>
      <p className="text-[12.5px] text-foreground truncate capitalize">{value}</p>
    </div>
  )
}

function ActionButton({ icon: Icon, label, detail, onClick }: { icon: any; label: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/30">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}
