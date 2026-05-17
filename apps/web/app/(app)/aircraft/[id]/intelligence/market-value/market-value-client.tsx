'use client'

/**
 * Market Value Estimate — client surface.
 *
 * Renders an AI-generated value RANGE (explicitly NOT an appraisal — see the
 * always-visible amber disclaimer banner). Sections: the valuation profile
 * (with user-selectable avionics tier + condition that re-POST on change),
 * the value-range estimate with its adjustment-breakdown table, the comps
 * note, and the record-derived value factors with citations. Handles
 * (re)generation against POST /api/intelligence/market-value with an animated
 * progress indicator, an empty state, and a print-friendly "Export PDF" path.
 */
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, DollarSign, Plane, TrendingUp, AlertTriangle,
  FileSearch, Upload, Info, ClipboardList,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import type { IntelligenceCitation } from '@/lib/intelligence/types'

// --- Report shape (mirrors the API route's MarketValueData) ----------------
type AvionicsTier = 'basic_vfr' | 'ifr' | 'glass'
type Condition = 'excellent' | 'good' | 'fair' | 'poor'

interface MarketValueData {
  empty?: boolean
  disclaimer: string
  profile: {
    make: string | null
    model: string | null
    year: number | null
    engine: string | null
    ttaf: number | null
    smoh: string
    spoh: string
    avionics: AvionicsTier
    condition: Condition
  }
  base: { low: number; high: number }
  adjustments: Array<{ label: string; effect: string }>
  estimate: { low: number; high: number }
  comps_note: string
  value_factors: Array<{ label: string; detail: string }>
  citations: IntelligenceCitation[]
}
export interface MarketValueReport {
  module: 'market-value'
  aircraft_id: string
  generated_at: string
  data: MarketValueData
  cached: boolean
}

const PROGRESS_STEPS = [
  'Reading airframe, engine & prop times…',
  'Estimating a base value range…',
  'Reviewing record quality…',
  'Applying value adjustments…',
]

const AVIONICS_OPTIONS: Array<{ value: AvionicsTier; label: string }> = [
  { value: 'basic_vfr', label: 'Basic VFR' },
  { value: 'ifr', label: 'IFR' },
  { value: 'glass', label: 'Glass' },
]
const CONDITION_OPTIONS: Array<{ value: Condition; label: string }> = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' },
]

const DISCLAIMER_FALLBACK =
  'This is an AI-generated estimate for planning purposes only. It is not an ' +
  'appraisal. For a certified aircraft appraisal contact an ASA-accredited ' +
  "aircraft appraiser or use Vref, Aircraft Bluebook, or AOPA's Value Tool."

/** Human-friendly "x ago" from an ISO timestamp. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'recently'
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Format a dollar amount as `$123,000`. */
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function MarketValueClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: MarketValueReport | null
}) {
  const [report, setReport] = useState<MarketValueReport | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Selections drive the adjustment math — seed from any hydrated report.
  const [avionics, setAvionics] = useState<AvionicsTier>(
    initialReport?.data?.profile?.avionics ?? 'ifr',
  )
  const [condition, setCondition] = useState<Condition>(
    initialReport?.data?.profile?.condition ?? 'good',
  )

  // Cycle the progress steps while a generation is in flight.
  useEffect(() => {
    if (loading) {
      setStepIdx(0)
      stepTimer.current = setInterval(() => {
        setStepIdx((i) => (i + 1) % PROGRESS_STEPS.length)
      }, 1800)
    } else if (stepTimer.current) {
      clearInterval(stepTimer.current)
      stepTimer.current = null
    }
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current)
    }
  }, [loading])

  async function generate(opts: {
    regenerate: boolean
    avionics: AvionicsTier
    condition: Condition
  }) {
    setLoading(true)
    try {
      const res = await fetch('/api/intelligence/market-value', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          regenerate: opts.regenerate,
          avionics: opts.avionics,
          condition: opts.condition,
        }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as MarketValueReport
      setReport(json)
      if (json.data?.profile) {
        setAvionics(json.data.profile.avionics)
        setCondition(json.data.profile.condition)
      }
    } catch {
      toast.error('Could not generate the value estimate. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Changing avionics or condition re-runs the estimate with the new inputs.
  function changeAvionics(next: AvionicsTier) {
    if (next === avionics || loading) return
    setAvionics(next)
    if (report && !report.data?.empty) {
      void generate({ regenerate: false, avionics: next, condition })
    }
  }
  function changeCondition(next: Condition) {
    if (next === condition || loading) return
    setCondition(next)
    if (report && !report.data?.empty) {
      void generate({ regenerate: false, avionics, condition: next })
    }
  }

  const data = report?.data
  const hasReport = Boolean(report) && !data?.empty
  const disclaimer = data?.disclaimer || DISCLAIMER_FALLBACK

  return (
    <div className="p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { overflow: visible !important; }
          .print-card { break-inside: avoid; box-shadow: none !important; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Market Value Estimate
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${relativeTime(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'An AI-estimated value range from specs, times, and record quality.'}
              </p>
            </div>
          </div>
          {hasReport && (
            <div className="flex items-center gap-2 no-print">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Export PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => generate({ regenerate: true, avionics, condition })}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Regenerate
              </Button>
            </div>
          )}
        </div>

        {/* Disclaimer — always visible */}
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[12px] leading-relaxed text-amber-900">{disclaimer}</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-20 px-6 text-center no-print">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              {PROGRESS_STEPS[stepIdx]}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Reconstructing airframe and engine times and pricing them against a
              base range — this can take a minute.
            </p>
          </div>
        )}

        {/* Empty state — no documents */}
        {!loading && data?.empty && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <FileSearch className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              No documents uploaded for this aircraft
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              The Market Value Estimate is built from this aircraft&apos;s uploaded
              records — specs, times, and maintenance history. Upload documents to
              generate the estimate.
            </p>
            <Link href={`/aircraft/${aircraftId}/documents`}>
              <Button size="sm" variant="outline">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload Documents
              </Button>
            </Link>
          </div>
        )}

        {/* No report yet — first run */}
        {!loading && !report && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-white py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Generate a Market Value Estimate
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll start from a make/model/year base range and adjust it for
                airframe and engine times, record quality, avionics, and condition.
              </p>
            </div>
            <Button onClick={() => generate({ regenerate: false, avionics, condition })}>
              <DollarSign className="h-4 w-4 mr-1.5" />
              Generate Estimate
            </Button>
          </div>
        )}

        {/* Report */}
        {!loading && hasReport && data && (
          <div className="space-y-4">
            <ProfileCard
              data={data}
              avionics={avionics}
              condition={condition}
              onAvionicsChange={changeAvionics}
              onConditionChange={changeCondition}
            />
            <EstimateCard data={data} />
            <CompsCard note={data.comps_note} />
            <ValueFactorsCard
              factors={data.value_factors}
              citations={data.citations}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// --- Card primitives -------------------------------------------------------

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof DollarSign
  children: React.ReactNode
}) {
  return (
    <section className="print-card rounded-xl border border-border bg-white p-5">
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

/** Segmented control used for the avionics tier + condition selectors. */
function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (next: T) => void
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1"
        style={{ fontWeight: 600 }}
      >
        {label}
      </div>
      <div className="inline-flex rounded-lg border border-border bg-muted/20 p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-[11.5px] rounded-md transition-colors ${
              value === opt.value
                ? 'bg-white text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            style={{ fontWeight: value === opt.value ? 600 : 500 }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function ProfileCard({
  data,
  avionics,
  condition,
  onAvionicsChange,
  onConditionChange,
}: {
  data: MarketValueData
  avionics: AvionicsTier
  condition: Condition
  onAvionicsChange: (next: AvionicsTier) => void
  onConditionChange: (next: Condition) => void
}) {
  const p = data.profile
  const rows: Array<[string, string]> = [
    ['Make / Model', [p.make, p.model].filter(Boolean).join(' ') || '—'],
    ['Year', p.year != null ? String(p.year) : '—'],
    ['Engine', p.engine || '—'],
    [
      'Total Airframe Time',
      p.ttaf != null ? `${Math.round(p.ttaf).toLocaleString('en-US')} hrs` : '—',
    ],
    ['Time Since Engine Overhaul (SMOH)', p.smoh || 'Unknown'],
    ['Time Since Prop Overhaul (SPOH)', p.spoh || 'Unknown'],
  ]
  return (
    <Card title="Aircraft Profile for Valuation" icon={Plane}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mb-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
              style={{ fontWeight: 600 }}
            >
              {label}
            </div>
            <div
              className="text-[13px] text-foreground tabular-nums"
              style={{ fontWeight: 600 }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-border/60 pt-3">
        <SegmentedControl
          label="Avionics Tier"
          value={avionics}
          options={AVIONICS_OPTIONS}
          onChange={onAvionicsChange}
        />
        <SegmentedControl
          label="Overall Condition"
          value={condition}
          options={CONDITION_OPTIONS}
          onChange={onConditionChange}
        />
      </div>
      <p className="mt-2.5 text-[11px] italic text-muted-foreground">
        Adjusting avionics tier or condition re-runs the estimate with the new
        inputs.
      </p>
    </Card>
  )
}

function EstimateCard({ data }: { data: MarketValueData }) {
  const { estimate, base, adjustments } = data
  return (
    <Card title="Value Range Estimate" icon={TrendingUp}>
      <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-5 text-center">
        <div
          className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1"
          style={{ fontWeight: 600 }}
        >
          Estimated Value Range
        </div>
        <div
          className="text-[28px] text-foreground tabular-nums leading-tight"
          style={{ fontWeight: 700 }}
        >
          {usd(estimate.low)} <span className="text-muted-foreground">–</span>{' '}
          {usd(estimate.high)}
        </div>
        <div className="text-[11px] text-muted-foreground mt-1">
          Base range {usd(base.low)} – {usd(base.high)} before adjustments
        </div>
      </div>

      <div className="mt-3.5">
        <div
          className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5"
          style={{ fontWeight: 600 }}
        >
          Adjustment Breakdown
        </div>
        {adjustments.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            No adjustments applied — the estimate equals the base range.
          </p>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-semibold pb-1">Factor</th>
                <th className="text-right font-semibold pb-1">Effect</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adj, i) => {
                const positive = adj.effect.trim().startsWith('+')
                return (
                  <tr key={i} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 text-foreground/90">{adj.label}</td>
                    <td
                      className="py-1.5 text-right tabular-nums whitespace-nowrap"
                      style={{ fontWeight: 600 }}
                    >
                      <span className={positive ? 'text-emerald-600' : 'text-red-600'}>
                        {adj.effect}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}

function CompsCard({ note }: { note: string }) {
  return (
    <Card title="Comparables Note" icon={Info}>
      {note && note.trim() ? (
        <p className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {note}
        </p>
      ) : (
        <p className="text-[12.5px] italic text-muted-foreground">
          No comparables note was generated for this estimate.
        </p>
      )}
    </Card>
  )
}

function ValueFactorsCard({
  factors,
  citations,
}: {
  factors: Array<{ label: string; detail: string }>
  citations: IntelligenceCitation[]
}) {
  return (
    <Card title="Value Factors From This Aircraft's Records" icon={ClipboardList}>
      {factors.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">
          No record-quality flags were found for this aircraft. Run the Prebuy
          Report to surface value-affecting findings from the maintenance records.
        </p>
      ) : (
        <ul className="space-y-2">
          {factors.map((f, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div
                  className="text-[12.5px] text-foreground"
                  style={{ fontWeight: 600 }}
                >
                  {f.label}
                </div>
                {f.detail && (
                  <div className="text-[12px] text-foreground/80 leading-relaxed">
                    {f.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <CitationChips citations={citations ?? []} />
    </Card>
  )
}
