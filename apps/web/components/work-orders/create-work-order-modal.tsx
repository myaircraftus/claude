'use client'

/**
 * Unified Create Work Order modal.
 *
 * One component, two entry points:
 *   - Aircraft → "Generate Work Order"  (aircraft pre-set, can't change)
 *   - /work-orders → "+ New"            (aircraft picker visible)
 *
 * Captures the inputs the AI / checklist generator actually use:
 *   1. Aircraft  (drives AD/SB pull + checklist template hints)
 *   2. Service type  (Annual / 100hr / 50hr / Oil / Squawk / etc.)
 *      → maps to a checklist template key in lib/work-orders/checklists.ts
 *   3. Scope text (free typing or browser dictation via the Mic button)
 *   4. Open squawks  (auto-loaded for the aircraft, click to include)
 *   5. Checklist source: shop template / AI-augmented / skip
 *
 * Submits to POST /api/work-orders, then routes to /work-orders/[id].
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plane, Loader2, Mic, X, AlertTriangle, Sparkles, ClipboardCheck,
  Wrench, Plus, ChevronDown, BookOpen, Bot,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { cn } from '@/lib/utils'

// ─── Service type catalog ─────────────────────────────────────────
// `key` matches lib/work-orders/checklists.ts CHECKLIST_TEMPLATE_KEY_ALIASES
// so the right template gets picked when the WO is created.
const SERVICE_TYPES: Array<{
  key: string
  label: string
  description: string
  icon: 'wrench' | 'sparkles' | 'shield'
}> = [
  { key: 'annual_inspection',         label: 'Annual Inspection',     description: 'FAR 91.409 annual', icon: 'wrench' },
  { key: 'hundred_hour_inspection',   label: '100-Hour Inspection',   description: 'FAR 91.409(b) 100-hr', icon: 'wrench' },
  { key: '50_hour_inspection',        label: '50-Hour Inspection',    description: 'Mid-cycle / oil sample', icon: 'wrench' },
  { key: 'oil_change',                label: 'Oil Change',            description: 'Drain, filter, refill', icon: 'wrench' },
  { key: 'pre_buy_inspection',        label: 'Pre-Buy Inspection',    description: 'Before purchase', icon: 'wrench' },
  { key: 'squawk_repair',             label: 'Squawk / Repair',       description: 'Pilot-reported issue', icon: 'wrench' },
  { key: 'ad_compliance',             label: 'AD / SB Compliance',    description: 'Recurring or one-time AD', icon: 'shield' },
  { key: 'avionics_installation',     label: 'Avionics / Electrical', description: 'Install, wiring, software', icon: 'sparkles' },
  { key: 'brake_repair',              label: 'Brakes',                description: 'Caliper, disc, lines', icon: 'wrench' },
  { key: 'tire_service',              label: 'Wheel / Tire Service',  description: 'Replace, balance, bearings', icon: 'wrench' },
  { key: 'battery_elt',               label: 'Battery / ELT',         description: 'Battery cap check + ELT', icon: 'wrench' },
  { key: 'general_maintenance',       label: 'Other / Custom',        description: 'Free-form scope', icon: 'wrench' },
]

type ChecklistSource = 'template' | 'ai' | 'skip'

export interface CreateWorkOrderModalProps {
  /** When set, the aircraft is locked to this id (modal opened from aircraft page). */
  initialAircraftId?: string | null
  /** Aircraft list (for the picker when not locked). */
  aircraft: Array<{ id: string; tail_number: string; make?: string | null; model?: string | null }>
  onClose: () => void
  /** Called after successful create with the new WO id. Defaults to navigating to /work-orders/[id]. */
  onCreated?: (workOrderId: string) => void
}

interface SquawkRow {
  id: string
  title: string
  description: string | null
  severity: string | null
  status: string
  reported_at: string | null
}

export function CreateWorkOrderModal({
  initialAircraftId = null,
  aircraft,
  onClose,
  onCreated,
}: CreateWorkOrderModalProps) {
  const router = useTenantRouter()

  const [aircraftId, setAircraftId] = useState<string>(initialAircraftId ?? '')
  const [serviceTypeKey, setServiceTypeKey] = useState<string>('annual_inspection')
  const [scope, setScope] = useState('')
  const [checklistSource, setChecklistSource] = useState<ChecklistSource>('ai')
  const [includeSquawkIds, setIncludeSquawkIds] = useState<Set<string>>(new Set())
  const [squawks, setSquawks] = useState<SquawkRow[]>([])
  const [loadingSquawks, setLoadingSquawks] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Voice dictation state (uses browser Web Speech API where available)
  const [recording, setRecording] = useState(false)
  const recogRef = useRef<any>(null)

  // ─── Squawk auto-load when aircraft changes ────────────────────
  useEffect(() => {
    if (!aircraftId) {
      setSquawks([])
      setIncludeSquawkIds(new Set())
      return
    }
    let cancelled = false
    setLoadingSquawks(true)
    fetch(`/api/squawks?aircraft_id=${encodeURIComponent(aircraftId)}&status=open&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const list: SquawkRow[] = Array.isArray(data?.squawks) ? data.squawks : []
        setSquawks(list)
        // Pre-select all open squawks by default — mechanic can de-select if any aren't in scope
        setIncludeSquawkIds(new Set(list.map((s) => s.id)))
      })
      .catch(() => {
        if (!cancelled) {
          setSquawks([])
          setIncludeSquawkIds(new Set())
        }
      })
      .finally(() => !cancelled && setLoadingSquawks(false))
    return () => {
      cancelled = true
    }
  }, [aircraftId])

  // ─── Voice dictation toggle ─────────────────────────────────────
  const startVoice = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice dictation not supported in this browser')
      return
    }
    if (recording) {
      recogRef.current?.stop?.()
      return
    }
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    let baseline = scope
    rec.onresult = (event: any) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interim += transcript
      }
      if (finalText) {
        baseline = (baseline ? baseline + ' ' : '') + finalText.trim()
        setScope(baseline)
      } else if (interim) {
        setScope((baseline ? baseline + ' ' : '') + interim)
      }
    }
    rec.onend = () => setRecording(false)
    rec.onerror = () => setRecording(false)
    recogRef.current = rec
    rec.start()
    setRecording(true)
  }, [recording, scope])

  // ─── Build complaint string from scope + included squawks ──────
  const compiledComplaint = useMemo(() => {
    const selected = squawks.filter((s) => includeSquawkIds.has(s.id))
    const squawkLines = selected.length === 0
      ? ''
      : 'Squawks in scope:\n' +
        selected
          .map((s, i) => `${i + 1}. ${s.title}${s.description ? ' — ' + s.description : ''}`)
          .join('\n')
    const scopeText = scope.trim()
    return [scopeText, squawkLines].filter(Boolean).join('\n\n')
  }, [scope, squawks, includeSquawkIds])

  const selectedServiceType = useMemo(
    () => SERVICE_TYPES.find((s) => s.key === serviceTypeKey) ?? SERVICE_TYPES[0],
    [serviceTypeKey],
  )

  // ─── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aircraftId) {
      toast.error('Please select an aircraft')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          service_type: selectedServiceType.label,
          complaint: compiledComplaint || selectedServiceType.label,
          status: 'open',
          checklist_source: checklistSource,
          // Pass the included squawk ids so the API can attach them to the WO
          included_squawk_ids: Array.from(includeSquawkIds),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error || `Failed to create WO (${res.status})`)
        return
      }
      const wo = await res.json()
      toast.success(`Work order ${wo.work_order_number ?? ''} created`)
      onClose()
      if (onCreated) onCreated(wo.id)
      else router.push(`/work-orders/${wo.id}`)
    } catch {
      toast.error('Failed to create work order')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[640px] max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-br from-[#0A1628] to-[#1E3A5F]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-[15px] text-white" style={{ fontWeight: 700 }}>
                Generate Work Order
              </div>
              <div className="text-[11px] text-white/60">
                Pick a type, drop in scope, AI builds the checklist
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Aircraft */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Aircraft
            </Label>
            {initialAircraftId ? (
              <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-2.5">
                <Plane className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                  {aircraft.find((a) => a.id === initialAircraftId)?.tail_number ?? 'Aircraft'}
                </span>
                {(() => {
                  const ac = aircraft.find((a) => a.id === initialAircraftId)
                  return (ac?.make || ac?.model)
                    ? <span className="text-xs text-muted-foreground">— {[ac?.make, ac?.model].filter(Boolean).join(' ')}</span>
                    : null
                })()}
              </div>
            ) : (
              <div className="relative">
                <Plane className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={aircraftId}
                  onChange={(e) => setAircraftId(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select aircraft…</option>
                  {aircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{(a.make || a.model) ? ` — ${[a.make, a.model].filter(Boolean).join(' ')}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
          </div>

          {/* 2. Service Type */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Type of Work Order
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_TYPES.map((t) => {
                const active = t.key === serviceTypeKey
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setServiceTypeKey(t.key)}
                    className={cn(
                      'text-left px-3 py-2 rounded-lg border transition-all',
                      active
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      {t.icon === 'shield' ? <Bot className="h-3.5 w-3.5 text-primary" /> : <Wrench className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{t.label}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{t.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Scope */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                Scope / Description
              </Label>
              <button
                type="button"
                onClick={startVoice}
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-colors',
                  recording
                    ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                <Mic className="h-3 w-3" />
                {recording ? 'Stop' : 'Dictate'}
              </button>
            </div>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder={`e.g. ${
                selectedServiceType.key === 'annual_inspection'
                  ? 'Aircraft due for annual. Customer reports rough idle on right mag at runup.'
                  : selectedServiceType.key === 'oil_change'
                    ? 'Routine 50hr oil change, AeroShell W100, send sample to Blackstone.'
                    : 'Describe what needs doing — type, paste, or click Dictate to use voice.'
              }`}
              rows={4}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* 4. Squawks */}
          {aircraftId && (
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                Open Squawks for this Aircraft
              </Label>
              {loadingSquawks ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                </div>
              ) : squawks.length === 0 ? (
                <div className="text-xs text-muted-foreground bg-muted/30 border border-border border-dashed rounded-lg px-3 py-2">
                  No open squawks for this aircraft.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {squawks.map((s) => {
                    const checked = includeSquawkIds.has(s.id)
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          'flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          checked
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border hover:bg-muted/30',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setIncludeSquawkIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(s.id)) next.delete(s.id)
                              else next.add(s.id)
                              return next
                            })
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>
                              {s.title}
                            </span>
                            {s.severity && (
                              <span className={cn(
                                'text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded border',
                                s.severity === 'grounding'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : s.severity === 'mel'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200',
                              )} style={{ fontWeight: 700 }}>
                                {s.severity}
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                              {s.description}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. Checklist source */}
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              Checklist
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'template' as const, icon: ClipboardCheck, title: 'Shop Template', desc: 'Use saved checklist' },
                { value: 'ai' as const,        icon: Sparkles,        title: 'AI Augmented',  desc: 'Template + AI gap-fill' },
                { value: 'skip' as const,      icon: X,                title: 'Skip',          desc: 'Empty checklist' },
              ].map((opt) => {
                const Icon = opt.icon
                const active = checklistSource === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setChecklistSource(opt.value)}
                    className={cn(
                      'text-left px-3 py-2.5 rounded-lg border transition-all',
                      active
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{opt.title}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Overdue / unverified AD/SB items are always added as required tasks regardless of choice.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-3 bg-muted/20">
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            {checklistSource === 'ai' && <><Sparkles className="h-3 w-3 inline -mt-0.5 mr-1" />AI will fill gaps based on your scope</>}
            {checklistSource === 'template' && <><ClipboardCheck className="h-3 w-3 inline -mt-0.5 mr-1" />Using your shop&rsquo;s saved template</>}
            {checklistSource === 'skip' && <>Checklist starts empty — you can add items later</>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !aircraftId}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> Generate Work Order</>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
