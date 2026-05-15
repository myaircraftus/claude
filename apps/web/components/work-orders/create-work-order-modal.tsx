'use client'

/**
 * Universal Create Work Order workflow.
 *
 * This component intentionally stays inside the existing work-order surface:
 * it does not touch RAG, document ingestion, retrieval, embeddings, or Ask.
 * It turns the canonical markdown workflow into a guided creation stepper
 * while still submitting through POST /api/work-orders.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Loader2,
  Mic,
  Plane,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { cn } from '@/lib/utils'

const SERVICE_TYPES: Array<{
  key: string
  label: string
  description: string
  category: string
}> = [
  { key: 'annual_inspection', label: 'Annual Inspection', description: 'FAR 91.409 annual with return-to-service review', category: 'Inspection' },
  { key: 'hundred_hour_inspection', label: '100-Hour Inspection', description: 'Commercial/rental 100-hour inspection workflow', category: 'Inspection' },
  { key: '50_hour_inspection', label: '50-Hour / Phase Inspection', description: 'Mid-cycle inspection, oil sample, phase items', category: 'Inspection' },
  { key: 'squawk_repair', label: 'Squawk / Repair', description: 'Pilot or owner-reported discrepancy', category: 'Repair' },
  { key: 'ad_compliance', label: 'AD / SB Compliance', description: 'Applicability review, compliance, and sign-off', category: 'Compliance' },
  { key: 'avionics_installation', label: 'Avionics / Electrical', description: 'Install, wiring, software, troubleshooting', category: 'Specialty' },
  { key: 'engine_powerplant', label: 'Engine / Powerplant', description: 'Engine inspection, repair, troubleshooting', category: 'Specialty' },
  { key: 'propeller', label: 'Propeller', description: 'Propeller inspection, service, repair', category: 'Specialty' },
  { key: 'airframe', label: 'Airframe', description: 'Airframe structure, flight controls, surfaces', category: 'Specialty' },
  { key: 'oil_change', label: 'Oil Change', description: 'Drain, filter, refill, sample, leak check', category: 'Service' },
  { key: 'tire_brake', label: 'Tire / Brake', description: 'Wheel, tire, brake, bearing service', category: 'Service' },
  { key: 'battery_elt', label: 'Battery / ELT', description: 'Battery check, ELT inspection, replacement', category: 'Service' },
  { key: 'pre_buy_inspection', label: 'Pre-Buy Inspection', description: 'Pre-purchase condition and records review', category: 'Inspection' },
  { key: 'general_maintenance', label: 'Custom', description: 'Free-form maintenance scope', category: 'Custom' },
]

const STEPS = [
  { id: 'aircraft', label: 'Aircraft', icon: Plane },
  { id: 'type', label: 'Work Type', icon: Wrench },
  { id: 'scope', label: 'Scope + Squawks', icon: FileText },
  { id: 'adsb', label: 'AD / SB', icon: ShieldCheck },
  { id: 'tasks', label: 'Tasks', icon: ClipboardCheck },
  { id: 'estimate', label: 'Estimate', icon: Receipt },
  { id: 'checklist', label: 'Checklist', icon: ClipboardCheck },
  { id: 'review', label: 'Review', icon: Check },
] as const

type StepId = typeof STEPS[number]['id']
type ChecklistSource = 'template' | 'ai' | 'skip'
type EstimateMode = 'existing' | 'new' | 'skip'

export interface CreateWorkOrderModalProps {
  initialAircraftId?: string | null
  aircraft: Array<{ id: string; tail_number: string; make?: string | null; model?: string | null }>
  onClose: () => void
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

interface AdRow {
  id?: string
  ad_number?: string | null
  compliance_status?: string | null
  next_due_date?: string | null
  evidence_notes?: string | null
  faa_airworthiness_directives?: {
    title?: string | null
    recurring?: boolean | null
    compliance_description?: string | null
  } | null
}

interface EstimateRow {
  id: string
  estimate_number: string
  status: string
  total?: number | string | null
  labor_total?: number | string | null
  parts_total?: number | string | null
  outside_services_total?: number | string | null
  created_at?: string | null
  line_items?: Array<{
    id: string
    description: string
    item_type?: string | null
    quantity?: number | string | null
    unit_price?: number | string | null
    line_total?: number | string | null
  }>
}

interface PlannedTask {
  id: string
  title: string
  role: string
  gate: 'required' | 'required_for_ia' | 'required_for_invoice' | 'optional'
  source: 'work_type' | 'squawk' | 'adsb' | 'estimate' | 'closeout'
}

const roleOptions = [
  'Lead mechanic',
  'A&P mechanic',
  'IA',
  'Avionics tech',
  'Parts manager',
  'Admin / billing',
]

function currency(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value ?? 0)
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateLabel(value?: string | null) {
  if (!value) return 'Not dated'
  return value.slice(0, 10)
}

function severityClass(value?: string | null) {
  if (value === 'grounding' || value === 'urgent') return 'bg-red-50 text-red-700 border-red-200'
  if (value === 'mel' || value === 'normal') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function adStatusClass(value?: string | null) {
  if (value === 'overdue' || value === 'non_compliant') return 'bg-red-50 text-red-700 border-red-200'
  if (value === 'unknown' || !value) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function defaultTasks(serviceTypeKey: string, selectedSquawks: SquawkRow[], selectedAds: AdRow[]): PlannedTask[] {
  const base: PlannedTask[] = []
  if (serviceTypeKey.includes('annual') || serviceTypeKey.includes('hundred') || serviceTypeKey.includes('50_hour')) {
    base.push(
      { id: 'airframe', title: 'Inspect airframe', role: 'A&P mechanic', gate: 'required', source: 'work_type' },
      { id: 'engine', title: 'Inspect engine / powerplant', role: 'A&P mechanic', gate: 'required', source: 'work_type' },
      { id: 'propeller', title: 'Inspect propeller', role: 'A&P mechanic', gate: 'required', source: 'work_type' },
    )
  } else if (serviceTypeKey.includes('avionics')) {
    base.push({ id: 'avionics', title: 'Avionics / electrical inspection', role: 'Avionics tech', gate: 'required', source: 'work_type' })
  } else if (serviceTypeKey.includes('engine')) {
    base.push({ id: 'engine', title: 'Engine troubleshooting and repair', role: 'A&P mechanic', gate: 'required', source: 'work_type' })
  } else if (serviceTypeKey.includes('propeller')) {
    base.push({ id: 'propeller', title: 'Propeller inspection and service', role: 'A&P mechanic', gate: 'required', source: 'work_type' })
  } else {
    base.push({ id: 'scope', title: 'Perform scoped maintenance', role: 'A&P mechanic', gate: 'required', source: 'work_type' })
  }

  selectedSquawks.slice(0, 6).forEach((s, index) => {
    base.push({
      id: `squawk-${s.id}`,
      title: `Resolve squawk: ${s.title}`,
      role: 'A&P mechanic',
      gate: s.severity === 'grounding' ? 'required_for_ia' : 'required',
      source: 'squawk',
    })
    if (index === 5 && selectedSquawks.length > 6) {
      base.push({
        id: 'squawk-overflow',
        title: `Review ${selectedSquawks.length - 6} additional linked squawks`,
        role: 'Lead mechanic',
        gate: 'required',
        source: 'squawk',
      })
    }
  })

  const unresolvedAds = selectedAds.filter((ad) => {
    const status = String(ad.compliance_status ?? 'unknown')
    return status !== 'compliant'
  })
  if (unresolvedAds.length > 0 || serviceTypeKey === 'ad_compliance') {
    base.push({
      id: 'adsb',
      title: unresolvedAds.length > 0 ? `Review ${unresolvedAds.length} AD/SB item${unresolvedAds.length === 1 ? '' : 's'}` : 'Review AD/SB applicability',
      role: 'IA',
      gate: 'required_for_ia',
      source: 'adsb',
    })
  }

  base.push(
    { id: 'parts', title: 'Reconcile labor, parts, and outside services', role: 'Lead mechanic', gate: 'required_for_invoice', source: 'estimate' },
    { id: 'logbook', title: 'Draft and review logbook entry', role: 'IA', gate: 'required_for_ia', source: 'closeout' },
    { id: 'invoice', title: 'Review invoice readiness', role: 'Admin / billing', gate: 'required_for_invoice', source: 'closeout' },
  )

  return base
}

export function CreateWorkOrderModal({
  initialAircraftId = null,
  aircraft,
  onClose,
  onCreated,
}: CreateWorkOrderModalProps) {
  const router = useTenantRouter()
  const lockedAircraft = Boolean(initialAircraftId)

  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]?.id ?? 'aircraft'
  const [aircraftId, setAircraftId] = useState<string>(initialAircraftId ?? '')
  const [serviceTypeKey, setServiceTypeKey] = useState<string>('annual_inspection')
  const [scope, setScope] = useState('')
  const [checklistSource, setChecklistSource] = useState<ChecklistSource>('ai')
  const [estimateMode, setEstimateMode] = useState<EstimateMode>('existing')
  const [selectedEstimateId, setSelectedEstimateId] = useState('')
  const [depositRequest, setDepositRequest] = useState('')
  const [includeSquawkIds, setIncludeSquawkIds] = useState<Set<string>>(new Set())
  const [taskAssignees, setTaskAssignees] = useState<Record<string, string>>({})
  const [squawks, setSquawks] = useState<SquawkRow[]>([])
  const [ads, setAds] = useState<AdRow[]>([])
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  const [loadingSquawks, setLoadingSquawks] = useState(false)
  const [loadingContext, setLoadingContext] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [recording, setRecording] = useState(false)
  const recogRef = useRef<any>(null)

  const selectedAircraft = useMemo(
    () => aircraft.find((a) => a.id === aircraftId) ?? null,
    [aircraft, aircraftId],
  )

  const selectedServiceType = useMemo(
    () => SERVICE_TYPES.find((s) => s.key === serviceTypeKey) ?? SERVICE_TYPES[0],
    [serviceTypeKey],
  )

  const selectedSquawks = useMemo(
    () => squawks.filter((s) => includeSquawkIds.has(s.id)),
    [squawks, includeSquawkIds],
  )

  const selectedEstimate = useMemo(
    () => estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId],
  )

  const unresolvedAds = useMemo(
    () => ads.filter((ad) => {
      const status = String(ad.compliance_status ?? 'unknown')
      return status === 'overdue' || status === 'unknown' || status === 'non_compliant'
    }),
    [ads],
  )

  const plannedTasks = useMemo(
    () => defaultTasks(serviceTypeKey, selectedSquawks, ads),
    [serviceTypeKey, selectedSquawks, ads],
  )

  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100)

  useEffect(() => {
    if (!aircraftId) {
      setSquawks([])
      setAds([])
      setEstimates([])
      setIncludeSquawkIds(new Set())
      setSelectedEstimateId('')
      return
    }

    let cancelled = false
    setLoadingSquawks(true)
    setLoadingContext(true)

    fetch(`/api/squawks?aircraft_id=${encodeURIComponent(aircraftId)}&status=open&limit=50`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        const list: SquawkRow[] = Array.isArray(data?.squawks) ? data.squawks : []
        setSquawks(list)
        setIncludeSquawkIds(new Set(list.map((s) => s.id)))
      })
      .catch(() => {
        if (!cancelled) {
          setSquawks([])
          setIncludeSquawkIds(new Set())
        }
      })
      .finally(() => !cancelled && setLoadingSquawks(false))

    Promise.all([
      fetch(`/api/aircraft/${encodeURIComponent(aircraftId)}/ads`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/estimates?aircraft_id=${encodeURIComponent(aircraftId)}&limit=20`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([adsData, estimateData]) => {
        if (cancelled) return
        const adList: AdRow[] = Array.isArray(adsData?.ads) ? adsData.ads : []
        const estimateList: EstimateRow[] = Array.isArray(estimateData?.estimates) ? estimateData.estimates : []
        setAds(adList)
        setEstimates(estimateList)
        const approved = estimateList.find((estimate) => estimate.status === 'approved') ?? estimateList[0]
        setSelectedEstimateId((current) => current || approved?.id || '')
        if (estimateList.length === 0) setEstimateMode('new')
      })
      .finally(() => !cancelled && setLoadingContext(false))

    return () => {
      cancelled = true
    }
  }, [aircraftId])

  const startVoice = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      toast.error('Voice dictation is not supported in this browser')
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
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalText += transcript
        else interim += transcript
      }
      if (finalText) {
        baseline = (baseline ? `${baseline} ` : '') + finalText.trim()
        setScope(baseline)
      } else if (interim) {
        setScope((baseline ? `${baseline} ` : '') + interim)
      }
    }
    rec.onend = () => setRecording(false)
    rec.onerror = () => setRecording(false)
    recogRef.current = rec
    rec.start()
    setRecording(true)
  }, [recording, scope])

  const compiledComplaint = useMemo(() => {
    const squawkLines = selectedSquawks.length
      ? [
          'Linked squawks:',
          ...selectedSquawks.map((s, index) => `${index + 1}. ${s.title}${s.description ? ` - ${s.description}` : ''}`),
        ].join('\n')
      : ''
    return [scope.trim(), squawkLines].filter(Boolean).join('\n\n')
  }, [scope, selectedSquawks])

  const creationPlan = useMemo(() => {
    const taskLines = plannedTasks.map((task, index) => {
      const assignee = taskAssignees[task.id] || task.role
      return `${index + 1}. ${task.title} - ${assignee} - ${task.gate}`
    })
    const estimateLine =
      estimateMode === 'existing' && selectedEstimate
        ? `Existing estimate: ${selectedEstimate.estimate_number} (${currency(selectedEstimate.total)})`
        : estimateMode === 'new'
          ? `Create estimate after work order${depositRequest ? `; deposit request ${currency(depositRequest)}` : ''}`
          : 'Estimate skipped with shop approval'

    return [
      'Work order creation workflow plan',
      `Aircraft: ${selectedAircraft?.tail_number ?? 'Unselected'}`,
      `Work type: ${selectedServiceType.label}`,
      `Squawks linked: ${selectedSquawks.length}`,
      `AD/SB unresolved at creation: ${unresolvedAds.length}`,
      estimateLine,
      `Checklist source: ${checklistSource}`,
      'Planned tasks:',
      ...taskLines,
    ].join('\n')
  }, [
    checklistSource,
    depositRequest,
    estimateMode,
    plannedTasks,
    selectedAircraft?.tail_number,
    selectedEstimate,
    selectedServiceType.label,
    selectedSquawks.length,
    taskAssignees,
    unresolvedAds.length,
  ])

  function canLeaveStep(currentStep: StepId) {
    if (currentStep === 'aircraft') return Boolean(aircraftId)
    if (currentStep === 'scope') return Boolean(scope.trim() || selectedSquawks.length > 0)
    if (currentStep === 'estimate') {
      if (estimateMode === 'existing') return Boolean(selectedEstimateId) || estimates.length === 0
      return true
    }
    return true
  }

  function goNext() {
    if (!canLeaveStep(step)) {
      if (step === 'aircraft') toast.error('Select an aircraft first')
      else if (step === 'scope') toast.error('Add scope text or include at least one squawk')
      else toast.error('Finish this step before continuing')
      return
    }
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1))
  }

  function goBack() {
    setStepIndex((index) => Math.max(index - 1, 0))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!aircraftId) {
      toast.error('Please select an aircraft')
      setStepIndex(0)
      return
    }
    if (!compiledComplaint.trim()) {
      toast.error('Add scope text or include a squawk')
      setStepIndex(2)
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
          complaint: compiledComplaint,
          status: 'open',
          checklist_source: checklistSource,
          included_squawk_ids: Array.from(includeSquawkIds),
          existing_estimate_id: estimateMode === 'existing' ? selectedEstimateId || null : null,
          estimate_mode: estimateMode,
          deposit_request_amount: depositRequest ? Number(depositRequest) : null,
          planned_tasks: plannedTasks.map((task) => ({
            ...task,
            assignee: taskAssignees[task.id] || task.role,
          })),
          creation_flow_version: 'universal_work_order_v1',
          internal_notes: creationPlan,
          customer_notes: scope.trim(),
        }),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error || `Failed to create work order (${res.status})`)
        return
      }

      toast.success(`Work order ${body.work_order_number ?? ''} created`)
      onClose()
      if (onCreated) onCreated(body.id)
      else router.push(`/work-orders/${body.id}`)
    } catch {
      toast.error('Failed to create work order')
    } finally {
      setSubmitting(false)
    }
  }

  function renderStep() {
    if (step === 'aircraft') {
      return (
        <section className="space-y-4">
          <StepHeading title="Aircraft context" body="Start with the aircraft. When launched from an aircraft page, the aircraft stays locked unless the user explicitly changes entry path." />
          {lockedAircraft && selectedAircraft ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center gap-3">
              <Plane className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold text-foreground">{selectedAircraft.tail_number}</div>
                <div className="text-xs text-muted-foreground">{[selectedAircraft.make, selectedAircraft.model].filter(Boolean).join(' ') || 'Aircraft locked from source page'}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Aircraft</Label>
              <div className="relative">
                <Plane className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={aircraftId}
                  onChange={(e) => setAircraftId(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-border bg-background text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select aircraft...</option>
                  {aircraft.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{(a.make || a.model) ? ` - ${[a.make, a.model].filter(Boolean).join(' ')}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {aircraftId && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <ContextTile label="Open squawks" value={loadingSquawks ? '...' : String(squawks.length)} />
              <ContextTile label="AD/SB review" value={loadingContext ? '...' : `${unresolvedAds.length} action`} intent={unresolvedAds.length ? 'warn' : 'ok'} />
              <ContextTile label="Estimates" value={loadingContext ? '...' : String(estimates.length)} />
              <ContextTile label="Checklist source" value="Template/AI" />
            </div>
          )}
        </section>
      )
    }

    if (step === 'type') {
      return (
        <section className="space-y-4">
          <StepHeading title="Work type" body="Each work type seeds the task plan, checklist, logbook draft, and close gates." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {SERVICE_TYPES.map((type) => {
              const active = type.key === serviceTypeKey
              return (
                <button
                  type="button"
                  key={type.key}
                  onClick={() => setServiceTypeKey(type.key)}
                  className={cn(
                    'text-left rounded-lg border p-3 transition-colors',
                    active ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{type.label}</span>
                    <span className="text-[10px] rounded border border-border px-1.5 py-0.5 text-muted-foreground">{type.category}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      )
    }

    if (step === 'scope') {
      return (
        <section className="space-y-4">
          <StepHeading title="Scope and squawks" body="Capture the complaint, findings to investigate, and linked open squawks. Squawks are linked as child records, not copied as loose text." />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Work scope</Label>
              <button
                type="button"
                onClick={startVoice}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                  recording ? 'border-red-200 bg-red-50 text-red-700' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                {recording ? 'Stop dictation' : 'Dictate'}
              </button>
            </div>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              rows={5}
              maxLength={1600}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-primary/30"
              placeholder="Describe the complaint, discrepancy, troubleshooting notes, or inspection scope."
            />
            <div className="text-right text-[11px] text-muted-foreground">{scope.length} / 1600</div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Open squawks</Label>
              <span className="text-xs text-muted-foreground">{selectedSquawks.length} selected</span>
            </div>
            {loadingSquawks ? (
              <InlineLoading label="Loading squawks" />
            ) : squawks.length === 0 ? (
              <EmptyBox label="No open squawks for this aircraft." />
            ) : (
              <div className="grid gap-2 max-h-[260px] overflow-y-auto pr-1">
                {squawks.map((squawk) => {
                  const checked = includeSquawkIds.has(squawk.id)
                  return (
                    <label
                      key={squawk.id}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                        checked ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setIncludeSquawkIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(squawk.id)) next.delete(squawk.id)
                            else next.add(squawk.id)
                            return next
                          })
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{squawk.title}</span>
                          <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', severityClass(squawk.severity))}>
                            {squawk.severity ?? 'normal'}
                          </span>
                        </div>
                        {squawk.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{squawk.description}</p>}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )
    }

    if (step === 'adsb') {
      return (
        <section className="space-y-4">
          <StepHeading title="AD / SB applicability review" body="Applicability is reviewed before task generation. Unknown or overdue rows become IA-review tasks and required checklist items." />
          {loadingContext ? (
            <InlineLoading label="Loading AD/SB context" />
          ) : ads.length === 0 ? (
            <EmptyBox label="No AD/SB applicability rows found for this aircraft. The work order will still include an AD/SB review task when needed." />
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {ads.slice(0, 20).map((ad, index) => {
                const status = ad.compliance_status ?? 'unknown'
                return (
                  <div key={ad.id ?? `${ad.ad_number}-${index}`} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {ad.ad_number ?? 'AD/SB item'}{ad.faa_airworthiness_directives?.title ? ` - ${ad.faa_airworthiness_directives.title}` : ''}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {ad.faa_airworthiness_directives?.compliance_description ?? ad.evidence_notes ?? 'Review source and applicability before close.'}
                        </div>
                      </div>
                      <span className={cn('shrink-0 rounded border px-2 py-1 text-[10px] font-semibold uppercase', adStatusClass(status))}>
                        {status === 'unknown' ? 'Needs IA review' : status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {ad.next_due_date && <div className="mt-2 text-[11px] text-muted-foreground">Next due: {dateLabel(ad.next_due_date)}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )
    }

    if (step === 'tasks') {
      return (
        <section className="space-y-4">
          <StepHeading title="Tasks and assignees" body="Tasks are assignment cards. The work order can still run in parallel; gates and dependencies control closeout." />
          <div className="space-y-2">
            {plannedTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-border bg-white p-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{task.title}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{task.source}</span>
                      <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase text-blue-700">{task.gate.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Required role: {task.role}</p>
                  </div>
                  <div>
                    <Label className="text-[11px]">Assigned to</Label>
                    <select
                      value={taskAssignees[task.id] ?? task.role}
                      onChange={(e) => setTaskAssignees((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      {[task.role, ...roleOptions.filter((role) => role !== task.role)].map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (step === 'estimate') {
      return (
        <section className="space-y-4">
          <StepHeading title="Estimate and line planning" body="Attach an estimate, create a new estimate later, or intentionally skip. Existing estimate lines are copied as planned work-order line items." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { id: 'existing' as const, title: 'Use existing', body: `${estimates.length} estimate${estimates.length === 1 ? '' : 's'} found`, icon: Receipt },
              { id: 'new' as const, title: 'Create new', body: 'Create estimate after the WO opens', icon: FileText },
              { id: 'skip' as const, title: 'Skip estimate', body: 'Record reason in activity/audit', icon: AlertTriangle },
            ].map((option) => {
              const Icon = option.icon
              const active = estimateMode === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setEstimateMode(option.id)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/30',
                  )}
                >
                  <Icon className={cn('h-4 w-4 mb-2', active ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="text-sm font-semibold text-foreground">{option.title}</div>
                  <div className="text-xs text-muted-foreground">{option.body}</div>
                </button>
              )
            })}
          </div>

          {estimateMode === 'existing' && (
            <div className="space-y-2">
              {estimates.length === 0 ? (
                <EmptyBox label="No estimates found. Choose Create new or Skip estimate." />
              ) : (
                estimates.map((estimate) => {
                  const active = selectedEstimateId === estimate.id
                  return (
                    <button
                      key={estimate.id}
                      type="button"
                      onClick={() => setSelectedEstimateId(estimate.id)}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{estimate.estimate_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {estimate.status} - {dateLabel(estimate.created_at)} - {(estimate.line_items?.length ?? 0)} lines
                          </div>
                        </div>
                        <div className="text-sm font-bold tabular-nums text-foreground">{currency(estimate.total)}</div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          )}

          {estimateMode === 'new' && (
            <div className="rounded-lg border border-border bg-white p-3 space-y-2">
              <Label>Optional deposit request</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={depositRequest}
                onChange={(e) => setDepositRequest(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Deposits are tracked as payment/credit records later, not as labor or part lines.</p>
            </div>
          )}
        </section>
      )
    }

    if (step === 'checklist') {
      return (
        <section className="space-y-4">
          <StepHeading title="Checklist plan" body="Shop-approved templates win. AI may only fill gaps or draft supplemental items; mechanics/IA verify generated content." />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { value: 'template' as const, title: 'Shop template', body: 'Use approved checklist only', icon: ClipboardCheck },
              { value: 'ai' as const, title: 'Template + AI', body: 'Fill gaps from scope and aircraft context', icon: Sparkles },
              { value: 'skip' as const, title: 'Start empty', body: 'Manual checklist only; AD/SB still added', icon: X },
            ].map((option) => {
              const Icon = option.icon
              const active = checklistSource === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setChecklistSource(option.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-primary/5 ring-2 ring-primary/15' : 'border-border hover:bg-muted/30',
                  )}
                >
                  <Icon className={cn('h-4 w-4 mb-2', active ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="text-sm font-semibold text-foreground">{option.title}</div>
                  <div className="text-xs text-muted-foreground">{option.body}</div>
                </button>
              )
            })}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Failed checklist items must become corrective action, squawk, deferred item, owner approval request, or authorized waiver. AI cannot silently approve or sign maintenance records.
          </div>
        </section>
      )
    }

    return (
      <section className="space-y-4">
        <StepHeading title="Review and create" body="Confirm the workflow before opening the work order. You can refine tasks, line items, checklist, owner view, AI summary, logbook, and invoice after creation." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReviewBlock label="Aircraft" value={selectedAircraft ? `${selectedAircraft.tail_number} ${[selectedAircraft.make, selectedAircraft.model].filter(Boolean).join(' ')}` : 'None'} />
          <ReviewBlock label="Work type" value={selectedServiceType.label} />
          <ReviewBlock label="Squawks linked" value={String(selectedSquawks.length)} />
          <ReviewBlock label="AD/SB action items" value={String(unresolvedAds.length)} />
          <ReviewBlock label="Tasks" value={String(plannedTasks.length)} />
          <ReviewBlock
            label="Estimate"
            value={
              estimateMode === 'existing' && selectedEstimate
                ? `${selectedEstimate.estimate_number} - ${currency(selectedEstimate.total)}`
                : estimateMode === 'new'
                  ? 'Create new estimate'
                  : 'Skipped'
            }
          />
        </div>
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Creation plan note</div>
          <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">{creationPlan}</pre>
        </div>
      </section>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-[1040px] overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <aside className="hidden w-[250px] shrink-0 border-r border-border bg-slate-50 p-4 lg:block">
          <div className="mb-5 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground">Create Work Order</div>
              <div className="text-[11px] text-muted-foreground">Universal workflow</div>
            </div>
          </div>
          <div className="space-y-1">
            {STEPS.map((item, index) => {
              const Icon = item.icon
              const active = index === stepIndex
              const complete = index < stepIndex
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (index <= stepIndex || canLeaveStep(step)) setStepIndex(index)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                    active ? 'bg-white text-primary shadow-sm border border-border' : 'text-muted-foreground hover:bg-white/70',
                  )}
                >
                  <span className={cn('flex h-6 w-6 items-center justify-center rounded-md border', active || complete ? 'border-primary bg-primary text-white' : 'border-border bg-white')}>
                    {complete ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  </span>
                  <span className="font-semibold">{item.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border px-4 py-3 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Step {stepIndex + 1} of {STEPS.length}</div>
                <h2 className="text-lg font-bold text-foreground">{STEPS[stepIndex]?.label}</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden">
              {STEPS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (index <= stepIndex || canLeaveStep(step)) setStepIndex(index)
                  }}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                    index === stepIndex ? 'border-primary bg-primary text-white' : index < stepIndex ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border text-muted-foreground',
                  )}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-5">
            {renderStep()}
          </main>

          <footer className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
            <Button type="button" variant="outline" onClick={stepIndex === 0 ? onClose : goBack} disabled={submitting}>
              {stepIndex === 0 ? (
                'Cancel'
              ) : (
                <>
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Back
                </>
              )}
            </Button>
            {stepIndex < STEPS.length - 1 ? (
              <Button type="button" onClick={goNext} disabled={submitting}>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting || !aircraftId}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    Create Work Order
                  </>
                )}
              </Button>
            )}
          </footer>
        </div>
      </form>
    </div>
  )
}

function StepHeading({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function ContextTile({ label, value, intent = 'neutral' }: { label: string; value: string; intent?: 'neutral' | 'ok' | 'warn' }) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      intent === 'warn' ? 'border-amber-200 bg-amber-50' : intent === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-white',
    )}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  )
}

function ReviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  )
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
      {label}
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
