'use client'

/**
 * Create Work Order — redesign (v2). Non-destructive: used only by the v2 list
 * shell (work-orders-shell-v2). The legacy 8-step wizard stays the default.
 *
 * Why this exists: research into how a shop actually opens a work order (the
 * owner-operator A&P / foreman / service writer, often on a hangar tablet)
 * showed the 8-step wizard inverts the real workflow. At the counter the
 * creator only has three things in hand — which aircraft, what's wrong, and
 * roughly what kind of job. Tasks, AD/SB findings, the estimate, and the
 * checklist all accrue DURING the job, not at intake. The backend agrees: of
 * the old eight steps, only aircraft + complaint produce required data; the
 * Tasks and AD/SB steps persist nothing on create.
 *
 * So this is a single-screen "digital squawk sheet": aircraft + complaint
 * (with voice) + work type → create + open. A collapsed "Set up the job"
 * disclosure keeps the planner's options (link squawks, attach an estimate,
 * choose the checklist source) one tap away without taxing the fast path.
 *
 * Submits through the same POST /api/work-orders. Fixes a latent bug from the
 * old modal: it sent the work-type LABEL ("Annual Inspection") where the API
 * expects the KEY ("annual_inspection"), so checklist seeding only worked by
 * accidental text-match. v2 sends the key.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Check, ChevronDown, Loader2, Mic, Plane, Receipt, Settings2, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { cn } from '@/lib/utils'
import { SERVICE_TYPES } from '@/components/work-orders/create-work-order-modal'
import { woHref } from '@/lib/work-orders/ui-mode'

type ChecklistSource = 'template' | 'ai' | 'skip'

interface SquawkRow {
  id: string
  title: string
  description: string | null
  severity: string | null
  status: string
  reported_at: string | null
}

interface EstimateRow {
  id: string
  estimate_number: string
  status: string
  total?: number | string | null
}

export interface CreateWorkOrderModalV2Props {
  initialAircraftId?: string | null
  aircraft: Array<{ id: string; tail_number: string; make?: string | null; model?: string | null }>
  onClose: () => void
  onCreated?: (workOrderId: string) => void
}

function currency(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value ?? 0)
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function severityClass(value?: string | null) {
  if (value === 'grounding' || value === 'urgent') return 'bg-red-50 text-red-700 border-red-200'
  if (value === 'mel' || value === 'normal') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

export function CreateWorkOrderModalV2({
  initialAircraftId = null,
  aircraft,
  onClose,
  onCreated,
}: CreateWorkOrderModalV2Props) {
  const router = useTenantRouter()
  const lockedAircraft = Boolean(initialAircraftId)

  const [aircraftId, setAircraftId] = useState<string>(initialAircraftId ?? '')
  const [serviceTypeKey, setServiceTypeKey] = useState<string>('') // optional — no presumptive default
  const [scope, setScope] = useState('')
  const [recording, setRecording] = useState(false)
  const recogRef = useRef<any>(null)

  // Optional "Set up the job" disclosure
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [checklistSource, setChecklistSource] = useState<ChecklistSource>('ai')
  const [includeSquawkIds, setIncludeSquawkIds] = useState<Set<string>>(new Set())
  const [selectedEstimateId, setSelectedEstimateId] = useState('')

  // Aircraft context (loaded once an aircraft is chosen)
  const [squawks, setSquawks] = useState<SquawkRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [adActionCount, setAdActionCount] = useState<number | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)

  const [submitting, setSubmitting] = useState(false)

  const selectedAircraft = useMemo(
    () => aircraft.find((a) => a.id === aircraftId) ?? null,
    [aircraft, aircraftId],
  )
  const selectedSquawks = useMemo(
    () => squawks.filter((s) => includeSquawkIds.has(s.id)),
    [squawks, includeSquawkIds],
  )
  const selectedEstimate = useMemo(
    () => estimates.find((e) => e.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId],
  )

  // Load this aircraft's situation: open squawks (pre-selected — they came in
  // with the plane), AD/SB review count, and any estimates to attach.
  useEffect(() => {
    if (!aircraftId) {
      setSquawks([]); setEstimates([]); setAdActionCount(null)
      setIncludeSquawkIds(new Set()); setSelectedEstimateId('')
      return
    }
    let cancelled = false
    setLoadingContext(true)
    Promise.all([
      fetch(`/api/squawks?aircraft_id=${encodeURIComponent(aircraftId)}&status=open&limit=50`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/aircraft/${encodeURIComponent(aircraftId)}/ads`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/estimates?aircraft_id=${encodeURIComponent(aircraftId)}&limit=20`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([squawkData, adData, estimateData]) => {
      if (cancelled) return
      const list: SquawkRow[] = Array.isArray(squawkData?.squawks) ? squawkData.squawks : []
      setSquawks(list)
      setIncludeSquawkIds(new Set(list.map((s) => s.id)))
      const ads: Array<{ compliance_status?: string | null }> = Array.isArray(adData?.ads) ? adData.ads : []
      setAdActionCount(ads.filter((a) => {
        const s = String(a.compliance_status ?? 'unknown')
        return s === 'overdue' || s === 'unknown' || s === 'non_compliant'
      }).length)
      const estimateList: EstimateRow[] = Array.isArray(estimateData?.estimates) ? estimateData.estimates : []
      setEstimates(estimateList)
    }).finally(() => { if (!cancelled) setLoadingContext(false) })
    return () => { cancelled = true }
  }, [aircraftId])

  const startVoice = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast.error('Voice dictation is not supported in this browser'); return }
    if (recording) { recogRef.current?.stop?.(); return }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    let baseline = scope
    rec.onresult = (event: any) => {
      let interim = '', finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interim += transcript
      }
      if (finalText) { baseline = (baseline ? `${baseline} ` : '') + finalText.trim(); setScope(baseline) }
      else if (interim) setScope((baseline ? `${baseline} ` : '') + interim)
    }
    rec.onend = () => setRecording(false)
    rec.onerror = () => setRecording(false)
    recogRef.current = rec
    rec.start()
    setRecording(true)
  }, [recording, scope])

  // Typed scope wins; otherwise fall back to squawk titles so the work order's
  // complaint field is never blank when squawks were the reason for the visit.
  const complaint = useMemo(() => {
    const typed = scope.trim()
    if (typed) return typed
    if (selectedSquawks.length) return selectedSquawks.map((s) => s.title).join('; ')
    return ''
  }, [scope, selectedSquawks])

  const canSubmit = Boolean(aircraftId) && (Boolean(scope.trim()) || selectedSquawks.length > 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!aircraftId) { toast.error('Pick an aircraft first'); return }
    if (!complaint) { toast.error('Add a short description of the work, or link a squawk'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          // KEY, not label — the API seeds the checklist off the enum key.
          service_type: serviceTypeKey || undefined,
          complaint,
          status: 'open',
          checklist_source: checklistSource,
          included_squawk_ids: Array.from(includeSquawkIds),
          existing_estimate_id: selectedEstimateId || null,
          estimate_mode: selectedEstimateId ? 'existing' : 'skip',
          creation_flow_version: 'quick_intake_v2',
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error || `Failed to create work order (${res.status})`); return }
      toast.success(`Work order ${body.work_order_number ?? ''} created`)
      onClose()
      if (onCreated) onCreated(body.id)
      else router.push(woHref(`/work-orders/${body.id}`, 'v2'))
    } catch {
      toast.error('Failed to create work order')
    } finally {
      setSubmitting(false)
    }
  }

  const aircraftSubtitle = selectedAircraft
    ? [selectedAircraft.make, selectedAircraft.model].filter(Boolean).join(' ')
    : ''

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94vh] w-full max-w-[600px] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-background shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white">
              <Plane className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground leading-tight">New work order</h2>
              <p className="text-[11px] text-muted-foreground">Start it now — add the rest as the job goes.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Aircraft */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Aircraft</Label>
            {lockedAircraft && selectedAircraft ? (
              <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3">
                <Plane className="h-5 w-5 text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{selectedAircraft.tail_number}</div>
                  {aircraftSubtitle && <div className="text-xs text-muted-foreground truncate">{aircraftSubtitle}</div>}
                </div>
              </div>
            ) : (
              <div className="relative">
                <Plane className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={aircraftId}
                  onChange={(e) => setAircraftId(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                >
                  <option value="">Select aircraft by tail number…</option>
                  {aircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{(a.make || a.model) ? ` · ${[a.make, a.model].filter(Boolean).join(' ')}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Situation strip — reassurance, not steps. Customer billing is
                auto-linked from the aircraft owner on the server. */}
            {aircraftId && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                  {loadingContext ? '…' : squawks.length} open squawk{squawks.length === 1 ? '' : 's'}
                </span>
                <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', adActionCount ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-border bg-muted/40 text-muted-foreground')}>
                  <ShieldCheck className="h-3 w-3" /> {loadingContext ? '…' : `${adActionCount ?? 0} AD/SB to review`}
                </span>
                {estimates.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                    <Receipt className="h-3 w-3" /> {estimates.length} estimate{estimates.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* What's the work */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">What’s the work?</Label>
              <button
                type="button"
                onClick={startVoice}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors',
                  recording ? 'border-red-200 bg-red-50 text-red-700' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                {recording ? 'Stop' : 'Dictate'}
              </button>
            </div>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={3}
              maxLength={1600}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none resize-none focus:ring-1 focus:ring-ring"
              placeholder="What the customer reported, e.g. “Annual due. Rough idle and a small oil seep near the #3 valve cover.”"
            />
          </div>

          {/* Work type — optional, one tap */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Work type <span className="text-muted-foreground/60 font-normal">· optional</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_TYPES.map((t) => {
                const active = t.key === serviceTypeKey
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setServiceTypeKey(active ? '' : t.key)}
                    aria-pressed={active}
                    title={t.description}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      active ? 'border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Optional setup disclosure */}
          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              aria-expanded={advancedOpen}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
            >
              <Settings2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-[13px] font-medium text-foreground">Set up the job <span className="text-muted-foreground font-normal">· optional</span></span>
              {(selectedSquawks.length > 0 || selectedEstimate) && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedSquawks.length > 0 ? `${selectedSquawks.length} squawk${selectedSquawks.length === 1 ? '' : 's'}` : ''}
                  {selectedSquawks.length > 0 && selectedEstimate ? ' · ' : ''}
                  {selectedEstimate ? 'estimate' : ''}
                </span>
              )}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')} />
            </button>

            {advancedOpen && (
              <div className="border-t border-border px-3.5 py-3 space-y-4">
                {/* Link squawks */}
                {squawks.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">Link open squawks</span>
                      <span className="text-[11px] text-muted-foreground">{selectedSquawks.length} of {squawks.length}</span>
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {squawks.map((s) => {
                        const checked = includeSquawkIds.has(s.id)
                        return (
                          <label key={s.id} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors', checked ? 'border-indigo-200 bg-indigo-50/40' : 'border-border hover:bg-muted/30')}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setIncludeSquawkIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(s.id)) next.delete(s.id); else next.add(s.id)
                                return next
                              })}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2 flex-wrap">
                                <span className="text-[13px] text-foreground">{s.title}</span>
                                <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', severityClass(s.severity))}>{s.severity ?? 'normal'}</span>
                              </span>
                              {s.description && <span className="block text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{s.description}</span>}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Attach estimate */}
                {estimates.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-foreground">Attach an estimate</span>
                    <div className="relative">
                      <select
                        value={selectedEstimateId}
                        onChange={(e) => setSelectedEstimateId(e.target.value)}
                        className="w-full pr-9 pl-3 py-2 rounded-lg border border-border bg-background text-[13px] appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">None — bill as we go</option>
                        {estimates.map((e) => (
                          <option key={e.id} value={e.id}>{e.estimate_number} · {currency(e.total)}{e.status === 'approved' ? ' (approved)' : ''}</option>
                        ))}
                      </select>
                      <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    {selectedEstimate && <p className="text-[11px] text-muted-foreground">Its line items copy onto the work order.</p>}
                  </div>
                )}

                {/* Checklist source */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-foreground">Checklist</span>
                  <div className="flex gap-1.5">
                    {([
                      { key: 'ai', label: 'AI-assisted', icon: Sparkles },
                      { key: 'template', label: 'Shop template', icon: Check },
                      { key: 'skip', label: 'Skip', icon: X },
                    ] as const).map((opt) => {
                      const active = checklistSource === opt.key
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setChecklistSource(opt.key)}
                          aria-pressed={active}
                          className={cn('flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] transition-colors', active ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-border text-muted-foreground hover:text-foreground')}
                        >
                          <Icon className="h-3.5 w-3.5" /> {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tasks, parts &amp; costs, AD/SB review, and sign-off live on the work order — you’ll set those up there as the job moves.
          </p>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creating…</> : <><Check className="mr-1.5 h-4 w-4" /> Create work order</>}
          </Button>
        </footer>
      </form>
    </div>
  )
}
