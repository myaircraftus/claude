'use client'

/**
 * Maintenance Forecast — client surface.
 *
 * Predicts upcoming maintenance from current tach time, calendar dates, and
 * inspection history. Renders four sections: current aircraft times, a
 * 12-month event timeline, what's overdue, and an editable future-cost
 * estimator (rates persisted to localStorage). Handles (re)generation against
 * POST /api/intelligence/maintenance-forecast with an animated progress
 * indicator, an empty state, and a print-friendly "Export PDF" path.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, CalendarClock, Gauge, AlertTriangle,
  DollarSign, FileSearch, Upload, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import { QualityBadge } from '@/components/intelligence/QualityBadge'
import type { IntelligenceCitation } from '@/lib/intelligence/types'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'

// --- Report shape (mirrors the API route's ForecastData) -------------------
interface CurrentTimes {
  ttaf: number | null
  smoh: number | null
  spoh: number | null
  sinceLast100: number | null
}
interface UpcomingEvent {
  label: string
  due_date: string | null
  due_hours: number | null
  kind: string
  overdue: boolean
  detail?: string
}
interface ForecastData {
  empty?: boolean
  currentTimes: CurrentTimes
  upcoming: UpcomingEvent[]
  overdue: UpcomingEvent[]
  summary: string
  citations: IntelligenceCitation[]
}
export interface ForecastReport {
  module: 'maintenance-forecast'
  aircraft_id: string
  generated_at: string
  data: ForecastData
  cached: boolean
  quality_score?: IntelligenceQualityScore
}

const PROGRESS_STEPS = [
  'Reading current tach and times…',
  'Checking inspection intervals…',
  'Projecting the 12-month horizon…',
  'Compiling the forecast…',
]

// --- Editable cost table ---------------------------------------------------
interface CostRow {
  id: string
  label: string
  low: number
  high: number
}
const DEFAULT_COSTS: CostRow[] = [
  { id: 'annual', label: 'Annual Inspection', low: 1200, high: 2500 },
  { id: 'hundred', label: '100-Hour Inspection', low: 800, high: 1500 },
  { id: 'engine', label: 'Engine Overhaul', low: 18000, high: 45000 },
  { id: 'prop', label: 'Propeller Overhaul', low: 2000, high: 5000 },
]
const COSTS_STORAGE_KEY = 'mx-forecast-costs'

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

/** Format an ISO date as "Mon YYYY" for the timeline. */
function monthLabel(iso: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'TBD'
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const fmtHours = (n: number | null) => (n != null ? `${n.toFixed(1)} hrs` : '—')

export function MaintenanceForecastClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: ForecastReport | null
}) {
  const [report, setReport] = useState<ForecastReport | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Editable cost rates — hydrated from localStorage after mount.
  const [costs, setCosts] = useState<CostRow[]>(DEFAULT_COSTS)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COSTS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CostRow[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge by id so new default rows survive an old cache.
          setCosts(
            DEFAULT_COSTS.map((d) => parsed.find((p) => p.id === d.id) ?? d),
          )
        }
      }
    } catch {
      // ignore — fall back to defaults
    }
  }, [])

  function updateCost(id: string, field: 'low' | 'high', value: number) {
    setCosts((prev) => {
      const next = prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      try {
        window.localStorage.setItem(COSTS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore — persistence is best-effort
      }
      return next
    })
  }

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

  async function generate(regenerate: boolean) {
    setLoading(true)
    try {
      const res = await fetch('/api/intelligence/maintenance-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as ForecastReport
      setReport(json)
    } catch {
      toast.error('Could not build the forecast. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const data = report?.data
  const hasReport = Boolean(report) && !data?.empty

  // 12-month budget = sum of every annual/100-hour cost range.
  const budget = useMemo(() => {
    const annual = costs.find((c) => c.id === 'annual')
    const hundred = costs.find((c) => c.id === 'hundred')
    const has100 = data?.upcoming.some((e) => e.kind === 'hundred-hour')
    let low = annual?.low ?? 0
    let high = annual?.high ?? 0
    if (has100 && hundred) {
      low += hundred.low
      high += hundred.high
    }
    return { low, high }
  }, [costs, data])

  return (
    <div className="p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { overflow: visible !important; }
          .print-card { break-inside: avoid; box-shadow: none !important; }
          input { border: none !important; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Maintenance Forecast
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${relativeTime(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'Predict upcoming maintenance from times, dates, and inspection history.'}
              </p>
            </div>
          </div>
          {hasReport && (
            <div className="flex items-center gap-2 no-print">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Export PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => generate(true)} disabled={loading}>
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

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-20 px-6 text-center no-print">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              {PROGRESS_STEPS[stepIdx]}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Reading current times and projecting inspection and overhaul intervals
              across the next 12 months.
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
              The Maintenance Forecast is built from this aircraft&apos;s uploaded
              logbooks and records. Upload documents to generate the forecast.
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
              <CalendarClock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Generate the Maintenance Forecast
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll read the current times, project the next annual, 100-hour,
                TBO, and recurring ADs, and flag anything overdue.
              </p>
            </div>
            <Button onClick={() => generate(false)}>
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Generate Forecast
            </Button>
          </div>
        )}

        {/* Report */}
        {!loading && hasReport && data && (
          <div className="space-y-4">
            <QualityBadge score={report?.quality_score} />
            <CurrentTimesCard data={data} />
            <TimelineCard upcoming={data.upcoming} />
            <OverdueCard overdue={data.overdue} />
            <CostsCard
              costs={costs}
              onUpdate={updateCost}
              budget={budget}
              has100={data.upcoming.some((e) => e.kind === 'hundred-hour')}
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
  icon: typeof CalendarClock
  children: React.ReactNode
}) {
  return (
    <section className="print-card rounded-xl border border-border bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

// --- Section 1: Current Aircraft Times -------------------------------------

function CurrentTimesCard({ data }: { data: ForecastData }) {
  const { ttaf, smoh, spoh, sinceLast100 } = data.currentTimes
  const cards: Array<[string, number | null, string]> = [
    ['TTAF', ttaf, 'Total airframe time'],
    ['SMOH', smoh, 'Since engine major overhaul'],
    ['SPOH', spoh, 'Since prop overhaul'],
    ['Since Last 100-hr', sinceLast100, 'Hours since 100-hour inspection'],
  ]
  return (
    <Card title="Current Aircraft Times" icon={Gauge}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(([label, value, hint]) => (
          <div key={label} className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              {label}
            </div>
            <div className="text-[18px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
              {value != null ? value.toFixed(1) : '—'}
              {value != null && <span className="text-[11px] text-muted-foreground ml-1">hrs</span>}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
          </div>
        ))}
      </div>
      <CitationChips citations={data.citations} />
    </Card>
  )
}

// --- Section 2: Upcoming Events timeline -----------------------------------

const KIND_COLOR: Record<string, string> = {
  annual: 'bg-blue-500',
  'hundred-hour': 'bg-indigo-500',
  'engine-tbo': 'bg-orange-500',
  'prop-tbo': 'bg-amber-500',
  ad: 'bg-purple-500',
  elt: 'bg-teal-500',
  xpdr: 'bg-cyan-500',
  vor: 'bg-slate-400',
  item: 'bg-emerald-500',
}

function TimelineCard({ upcoming }: { upcoming: UpcomingEvent[] }) {
  if (upcoming.length === 0) {
    return (
      <Card title="Upcoming Events — Next 12 Months" icon={CalendarClock}>
        <p className="text-[12.5px] italic text-muted-foreground">
          No upcoming events projected from the available records.
        </p>
      </Card>
    )
  }
  const dated = upcoming.filter((e) => e.due_date)
  const undated = upcoming.filter((e) => !e.due_date)
  return (
    <Card title="Upcoming Events — Next 12 Months" icon={CalendarClock}>
      {/* Horizontal 12-month timeline */}
      {dated.length > 0 && (
        <div className="mb-4">
          <div className="relative overflow-x-auto pb-2">
            <div className="flex items-stretch gap-3 min-w-max">
              {dated.map((e, i) => (
                <div
                  key={`${e.label}-${i}`}
                  className="flex flex-col items-center w-[140px] shrink-0"
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
                    {monthLabel(e.due_date)}
                  </div>
                  <div className={`h-2 w-2 rounded-full ${KIND_COLOR[e.kind] ?? 'bg-primary'}`} />
                  <div className="mt-1 w-px flex-1 bg-border" />
                  <div className="mt-1 rounded-lg border border-border/70 bg-muted/10 p-2 text-center w-full">
                    <div className="text-[11.5px] text-foreground" style={{ fontWeight: 600 }}>
                      {e.label}
                    </div>
                    {e.detail && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                        {e.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hours-based / undated events */}
      {undated.length > 0 && (
        <div className="space-y-1.5">
          {undated.map((e, i) => (
            <div
              key={`${e.label}-${i}`}
              className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/10 px-2.5 py-1.5"
            >
              <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${KIND_COLOR[e.kind] ?? 'bg-primary'}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>
                    {e.label}
                  </span>
                  {e.due_hours != null && (
                    <span className="text-[10.5px] text-muted-foreground tabular-nums">
                      due ~{fmtHours(e.due_hours)} TT
                    </span>
                  )}
                </div>
                {e.detail && (
                  <div className="text-[11px] text-muted-foreground leading-tight">{e.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// --- Section 3: What's Overdue ---------------------------------------------

function OverdueCard({ overdue }: { overdue: UpcomingEvent[] }) {
  return (
    <Card title="What's Overdue" icon={AlertTriangle}>
      {overdue.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">
          Nothing detected as overdue from the available records.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {overdue.map((e, i) => (
            <li
              key={`${e.label}-${i}`}
              className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50/60 px-2.5 py-1.5"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] text-foreground" style={{ fontWeight: 600 }}>
                    {e.label}
                  </span>
                  <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-white" style={{ fontWeight: 700 }}>
                    Overdue
                  </span>
                  {e.due_date && (
                    <span className="text-[10.5px] text-muted-foreground">
                      was due {monthLabel(e.due_date)}
                    </span>
                  )}
                </div>
                {e.detail && (
                  <div className="text-[11px] text-muted-foreground leading-tight">{e.detail}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2.5 text-[11px] italic text-muted-foreground">
        Based on uploaded maintenance records. Verify with your A&amp;P or IA.
      </p>
    </Card>
  )
}

// --- Section 4: Estimated Future Costs (editable) --------------------------

function CostsCard({
  costs,
  onUpdate,
  budget,
  has100,
}: {
  costs: CostRow[]
  onUpdate: (id: string, field: 'low' | 'high', value: number) => void
  budget: { low: number; high: number }
  has100: boolean
}) {
  return (
    <Card title="Estimated Future Costs" icon={DollarSign}>
      <p className="text-[11px] text-muted-foreground mb-2.5">
        Editable rate estimates — adjust to your shop&apos;s pricing. Changes are saved
        to this browser.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="pb-1.5" style={{ fontWeight: 600 }}>Item</th>
              <th className="pb-1.5 w-[120px]" style={{ fontWeight: 600 }}>Low</th>
              <th className="pb-1.5 w-[120px]" style={{ fontWeight: 600 }}>High</th>
            </tr>
          </thead>
          <tbody>
            {costs.map((row) => (
              <tr key={row.id} className="border-t border-border/60">
                <td className="py-1.5 text-foreground flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                  <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                  {row.label}
                </td>
                <td className="py-1.5">
                  <CostInput
                    value={row.low}
                    onChange={(v) => onUpdate(row.id, 'low', v)}
                  />
                </td>
                <td className="py-1.5">
                  <CostInput
                    value={row.high}
                    onChange={(v) => onUpdate(row.id, 'high', v)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
          Estimated 12-Month Maintenance Budget
        </div>
        <div className="text-[16px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
          {fmtMoney(budget.low)} – {fmtMoney(budget.high)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {has100
            ? 'Includes the annual and 100-hour inspections projected for this aircraft.'
            : 'Covers the annual inspection. Engine and prop overhauls are not due within 12 months.'}
        </div>
      </div>
    </Card>
  )
}

function CostInput({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center rounded-md border border-border bg-white px-1.5">
      <span className="text-[11px] text-muted-foreground">$</span>
      <input
        type="number"
        min={0}
        step={50}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full bg-transparent px-1 py-1 text-[12px] text-foreground tabular-nums outline-none"
      />
    </div>
  )
}
