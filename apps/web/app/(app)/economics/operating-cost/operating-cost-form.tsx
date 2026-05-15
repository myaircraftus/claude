'use client'

/**
 * Aircraft Operating Cost — editable form (Owner Economics).
 *
 * Loads the stored profile (or an AI suggestion) from
 * /api/aircraft/[id]/operating-cost/profile, lets the owner edit every
 * field, shows a live summary card via the pure computeOperatingCost(),
 * and saves back with PUT. "AI Suggest" re-fills from OpenAI; AI-filled
 * fields get an amber badge until the owner edits them.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import { Loader2, Sparkles, Save, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  computeOperatingCost,
  usd0,
  usd2,
  OPERATING_COST_FIELDS,
  type OperatingCostField,
} from '@/lib/economics/operating-cost'

interface AircraftOption {
  id: string
  label: string
}

type Fields = Record<OperatingCostField, string> & {
  is_leased: boolean
  rental_type: 'dry' | 'wet'
}

const EMPTY: Fields = {
  fuel_burn_gph: '',
  fuel_price_per_gal: '',
  oil_burn_qph: '',
  oil_price_per_qt: '',
  engine_reserve_per_hr: '',
  prop_reserve_per_hr: '',
  scheduled_maint_per_hr: '',
  unscheduled_maint_per_hr: '',
  insurance_per_year: '',
  annual_fixed_cost: '',
  tiedown_per_month: '',
  expected_annual_hours: '150',
  lease_per_month: '',
  selling_rate_per_hr: '',
  is_leased: false,
  rental_type: 'dry',
}

const CONFIDENCE_TINT: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-700 border-red-200',
}

export function OperatingCostForm({
  aircraft,
  selectedId,
}: {
  aircraft: AircraftOption[]
  selectedId: string
}) {
  const router = useTenantRouter()
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())
  const [aiConfidence, setAiConfidence] = useState<string | null>(null)
  const [aiNotes, setAiNotes] = useState<string | null>(null)
  const [source, setSource] = useState<'loading' | 'saved' | 'ai_suggested' | 'empty'>('loading')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const applyData = useCallback((data: Record<string, unknown>, isAi: boolean) => {
    const next: Fields = { ...EMPTY }
    for (const f of OPERATING_COST_FIELDS) {
      const v = data[f]
      if (v !== null && v !== undefined && v !== '') next[f] = String(v)
      else if (f === 'expected_annual_hours' && !isAi) next[f] = ''
    }
    next.is_leased = data.is_leased === true
    next.rental_type = data.rental_type === 'wet' ? 'wet' : 'dry'
    setFields(next)
    setAiConfidence(typeof data.ai_confidence === 'string' ? data.ai_confidence : null)
    setAiNotes(typeof data.ai_notes === 'string' && data.ai_notes ? data.ai_notes : null)
    setAiFields(
      isAi
        ? new Set(OPERATING_COST_FIELDS.filter((f) => data[f] !== null && data[f] !== undefined))
        : new Set(),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setSource('loading')
    fetch(`/api/aircraft/${selectedId}/operating-cost/profile`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return
        if (j?.source === 'saved') {
          applyData(j.data ?? {}, false)
          setSource('saved')
        } else if (j?.source === 'ai_suggested') {
          applyData(j.data ?? {}, true)
          setSource('ai_suggested')
        } else {
          setFields(EMPTY)
          setAiFields(new Set())
          setAiConfidence(null)
          setAiNotes(null)
          setSource('empty')
        }
      })
      .catch(() => {
        if (!cancelled) setSource('empty')
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, applyData])

  function setField(name: keyof Fields, value: string | boolean) {
    setFields((prev) => ({ ...prev, [name]: value }))
    if (typeof name === 'string') {
      setAiFields((prev) => {
        if (!prev.has(name)) return prev
        const n = new Set(prev)
        n.delete(name)
        return n
      })
    }
  }

  async function runAiSuggest() {
    setAiLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${selectedId}/operating-cost/ai-suggest`, {
        method: 'POST',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'AI suggestion failed')
        return
      }
      applyData(j.data ?? {}, true)
      setSource('ai_suggested')
      toast.success('AI estimates filled in — review, edit anything, then Save')
    } catch {
      toast.error('Could not reach the AI service')
    } finally {
      setAiLoading(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { rental_type: fields.rental_type, is_leased: fields.is_leased }
      for (const f of OPERATING_COST_FIELDS) body[f] = fields[f] === '' ? null : fields[f]
      body.ai_confidence = aiConfidence
      body.ai_notes = aiNotes
      const res = await fetch(`/api/aircraft/${selectedId}/operating-cost/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j?.error ?? 'Save failed')
        return
      }
      applyData(j.data ?? {}, false)
      setSource('saved')
      toast.success('Operating cost saved')
    } catch {
      toast.error('Save failed — network error')
    } finally {
      setSaving(false)
    }
  }

  const calc = computeOperatingCost(fields)

  function onSelectAircraft(id: string) {
    router.push(`/economics/operating-cost?aircraft=${encodeURIComponent(id)}`)
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      {/* Aircraft selector + AI suggest */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Aircraft Operating Cost
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            Per-hour and fixed costs for one aircraft. Save to power the Economics dashboard.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="ac-select" className="text-[11px] text-muted-foreground">Aircraft</Label>
            <select
              id="ac-select"
              value={selectedId}
              onChange={(e) => onSelectAircraft(e.target.value)}
              className="mt-1 block h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {aircraft.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" onClick={runAiSuggest} disabled={aiLoading || source === 'loading'}>
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            AI Suggest
          </Button>
        </div>
      </div>

      {/* AI notes callout */}
      {aiNotes && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5">
          <Lightbulb className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-amber-900" style={{ fontWeight: 700 }}>AI Analysis</span>
              {aiConfidence && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${CONFIDENCE_TINT[aiConfidence] ?? CONFIDENCE_TINT.low}`} style={{ fontWeight: 700 }}>
                  {aiConfidence} confidence
                </span>
              )}
            </div>
            <p className="text-[12px] text-amber-900/90 mt-1">{aiNotes}</p>
          </div>
        </div>
      )}

      {source === 'loading' ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
          {/* ── Form ── */}
          <div className="space-y-4">
            {/* Fuel & Oil */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Fuel &amp; Oil</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                <NumField label="Fuel burn" unit="gal/hr" name="fuel_burn_gph" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Fuel price" unit="$/gal" name="fuel_price_per_gal" fields={fields} aiFields={aiFields} onChange={setField} />
                <Derived label="Fuel cost / hr" value={usd2(calc.fuelCostPerHr)} />
                <NumField label="Oil burn" unit="qt/hr" name="oil_burn_qph" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Oil price" unit="$/qt" name="oil_price_per_qt" fields={fields} aiFields={aiFields} onChange={setField} />
                <Derived label="Oil cost / hr" value={usd2(calc.oilCostPerHr)} />
              </CardContent>
            </Card>

            {/* Reserves */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Reserves (per flight hour)</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                <NumField label="Engine reserve" unit="$/hr" name="engine_reserve_per_hr" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Prop reserve" unit="$/hr" name="prop_reserve_per_hr" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Scheduled maintenance" unit="$/hr" name="scheduled_maint_per_hr" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Unscheduled maintenance" unit="$/hr" name="unscheduled_maint_per_hr" fields={fields} aiFields={aiFields} onChange={setField} />
                <Derived label="Total reserves / hr" value={usd2(calc.reservePerHr)} />
              </CardContent>
            </Card>

            {/* Annual Fixed */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Annual Fixed Costs</CardTitle></CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                <NumField label="Insurance" unit="$/year" name="insurance_per_year" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Other annual fixed" unit="$/year" name="annual_fixed_cost" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Tie-down / Hangar" unit="$/month" name="tiedown_per_month" fields={fields} aiFields={aiFields} onChange={setField} />
                <NumField label="Expected annual hours" unit="hrs" name="expected_annual_hours" fields={fields} aiFields={aiFields} onChange={setField} />
                <Derived label="Fixed allocation / hr" value={usd2(calc.fixedPerHr)} />
              </CardContent>
            </Card>

            {/* Financing */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Financing</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Toggle
                  checked={fields.is_leased}
                  onChange={(v) => setField('is_leased', v)}
                  label="Financed / leased aircraft"
                />
                {fields.is_leased && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <NumField label="Loan / lease payment" unit="$/month" name="lease_per_month" fields={fields} aiFields={aiFields} onChange={setField} />
                    <Derived label="Lease allocation / hr" value={usd2(calc.leasePerHr)} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Selling rate */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Selling Rate (optional)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Toggle
                  checked={!!fields.selling_rate_per_hr || fields.rental_type !== 'dry'}
                  onChange={(v) => { if (!v) setField('selling_rate_per_hr', '') }}
                  label="I charter or rent this aircraft"
                  forceOn={!!fields.selling_rate_per_hr}
                />
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Rental type</Label>
                    <div className="mt-1 inline-flex rounded-md border border-input overflow-hidden">
                      {(['dry', 'wet'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setField('rental_type', t)}
                          className={`px-4 h-9 text-sm capitalize transition-colors ${
                            fields.rental_type === t ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted/50'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <NumField label="Selling rate" unit="$/hr" name="selling_rate_per_hr" fields={fields} aiFields={aiFields} onChange={setField} />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save operating cost
              </Button>
            </div>
          </div>

          {/* ── Live summary ── */}
          <div className="lg:sticky lg:top-4">
            <Card className="bg-[#0c2d6b] text-white border-[#0c2d6b]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Cost summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <SummaryRow label="Dry cost / hr" value={usd2(calc.dryCostPerHr)} />
                <SummaryRow label="Wet cost / hr" value={usd2(calc.wetCostPerHr)} strong />
                <div className="h-px bg-white/15 my-1" />
                <SummaryRow label="Monthly est." value={usd0(calc.monthlyEst)} />
                <SummaryRow label="Annual est." value={usd0(calc.annualEst)} />
                {calc.hasSellingRate && (
                  <>
                    <div className="h-px bg-white/15 my-1" />
                    <SummaryRow label={`Selling rate (${fields.rental_type})`} value={`${usd2(calc.sellingRate)}/hr`} />
                    <SummaryRow
                      label="Profit / hr"
                      value={`${calc.profitPerHr >= 0 ? '+' : ''}${usd2(calc.profitPerHr)}`}
                      tone={calc.profitPerHr >= 0 ? 'pos' : 'neg'}
                    />
                    <SummaryRow
                      label="Margin"
                      value={`${calc.marginPct.toFixed(0)}%`}
                      tone={calc.profitPerHr >= 0 ? 'pos' : 'neg'}
                    />
                  </>
                )}
                <p className="text-[10.5px] text-white/45 pt-1">
                  Updates live as you type. Save to persist.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────── */

function NumField({
  label, unit, name, fields, aiFields, onChange,
}: {
  label: string
  unit: string
  name: OperatingCostField
  fields: Fields
  aiFields: Set<string>
  onChange: (name: keyof Fields, value: string) => void
}) {
  const isAi = aiFields.has(name)
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={name} className="text-[11px] text-muted-foreground">{label}</Label>
        {isAi && (
          <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide" style={{ fontWeight: 700 }}>
            AI
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <Input
          id={name}
          type="number"
          inputMode="decimal"
          value={fields[name]}
          onChange={(e) => onChange(name, e.target.value)}
          className="h-9"
        />
        <span className="text-[11px] text-muted-foreground whitespace-nowrap w-16">{unit}</span>
      </div>
    </div>
  )
}

function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-end">
      <div className="rounded-md bg-muted/50 border border-border px-3 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>{label}</div>
        <div className="text-[14px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  )
}

function Toggle({
  checked, onChange, label, forceOn,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  forceOn?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={forceOn}
      className="flex items-center gap-2.5"
    >
      <span
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="text-[13px] text-foreground">{label}</span>
    </button>
  )
}

function SummaryRow({
  label, value, strong, tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'pos' | 'neg'
}) {
  const valueColor = tone === 'pos' ? 'text-emerald-300' : tone === 'neg' ? 'text-rose-300' : 'text-white'
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-white/60">{label}</span>
      <span className={`tabular-nums ${valueColor} ${strong ? 'text-[17px]' : 'text-[13px]'}`} style={{ fontWeight: 700 }}>
        {value}
      </span>
    </div>
  )
}
