'use client'

/**
 * Airframe / Engine / Prop Comparison — client surface.
 *
 * Renders the cached/generated report as four sections: three Time Summary
 * cards (airframe / engine / prop with TBO progress), a plain-div horizontal
 * timeline that marks the engine and prop start points on the airframe span,
 * a Discrepancy Analysis list with severity badges, and a Time Since Key
 * Events table. Handles (re)generation against POST
 * /api/intelligence/time-comparison with an animated progress indicator, an
 * empty state, and a print-friendly "Export PDF" path.
 */
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, Scale, Plane, Cog, Fan, GitCompare,
  AlertTriangle, ListChecks, FileSearch, Upload, Info, AlertOctagon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import { QualityBadge } from '@/components/intelligence/QualityBadge'
import type { IntelligenceCitation } from '@/lib/intelligence/types'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'

// --- Report shape (mirrors the API route's TimeComparisonData) -------------
type Severity = 'critical' | 'warning' | 'info'

interface Discrepancy {
  title: string
  detail: string
  severity: Severity
}
interface TimeSinceRow {
  label: string
  hours: number | null
  calendar: string | null
  found: boolean
}
interface TimeComparisonData {
  empty?: boolean
  airframe?: { ttaf: number | null }
  engine?: { smoh: number | null; tbo: number; pct: number | null; install_tach: number | null }
  prop?: { spoh: number | null; tbo: number; pct: number | null }
  discrepancies?: Discrepancy[]
  timeSince?: TimeSinceRow[]
  citations?: IntelligenceCitation[]
}
export interface TimeComparisonReport {
  module: 'time-comparison'
  aircraft_id: string
  generated_at: string
  data: TimeComparisonData
  cached: boolean
  quality_score?: IntelligenceQualityScore
}

const PROGRESS_STEPS = [
  'Reading airframe, engine and prop logs…',
  'Measuring time against TBO limits…',
  'Cross-checking engine and prop times…',
  'Flagging discrepancies…',
]

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

/** Format an hours value, or an em-dash when absent. */
function hrs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString()} h`
}

export function TimeComparisonClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: TimeComparisonReport | null
}) {
  const [report, setReport] = useState<TimeComparisonReport | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)

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
      const res = await fetch('/api/intelligence/time-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as TimeComparisonReport
      setReport(json)
    } catch {
      toast.error('Could not generate the comparison. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const data = report?.data
  const hasReport = Boolean(report) && !data?.empty

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
              <Scale className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Airframe / Engine / Prop Comparison
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${relativeTime(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'Compare airframe, engine and prop time against TBO and each other.'}
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
              Reconstructing airframe, engine and prop timelines from the logbooks — this
              can take a minute.
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
              The Time Comparison is built from this aircraft&apos;s uploaded logbooks
              and records. Upload documents to generate the comparison.
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
              <Scale className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Compare airframe, engine and prop time
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll measure TTAF, engine SMOH and prop SPOH against published TBO
                limits and against each other — surfacing mid-life swaps and timing gaps.
              </p>
            </div>
            <Button onClick={() => generate(false)}>
              <Scale className="h-4 w-4 mr-1.5" />
              Generate Comparison
            </Button>
          </div>
        )}

        {/* Report */}
        {!loading && hasReport && data && (
          <div className="space-y-4">
            <QualityBadge score={report?.quality_score} />
            <SummaryCards data={data} />
            <TimelineCard data={data} />
            <DiscrepancyCard discrepancies={data.discrepancies ?? []} />
            <TimeSinceCard rows={data.timeSince ?? []} />
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-2">
                <FileSearch className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  Sources
                </h2>
              </div>
              <p className="text-[12px] text-muted-foreground mb-1">
                Document evidence behind the airframe, engine and prop figures above.
              </p>
              <CitationChips citations={data.citations ?? []} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Section 1: Time Summary cards -----------------------------------------

function progressColor(pct: number | null): string {
  if (pct == null) return 'bg-muted-foreground/30'
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function SummaryCard({
  label,
  icon: Icon,
  primary,
  primaryLabel,
  tbo,
  pct,
}: {
  label: string
  icon: typeof Plane
  primary: number | null | undefined
  primaryLabel: string
  tbo?: number
  pct?: number | null
}) {
  return (
    <div className="print-card rounded-xl border border-border bg-white p-4 flex-1 min-w-[180px]">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span
          className="text-[10px] uppercase tracking-wide text-muted-foreground"
          style={{ fontWeight: 700 }}
        >
          {label}
        </span>
      </div>
      <div className="text-[22px] text-foreground tabular-nums leading-none" style={{ fontWeight: 700 }}>
        {hrs(primary)}
      </div>
      <div className="text-[10.5px] text-muted-foreground mt-0.5">{primaryLabel}</div>
      {tbo != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10.5px] mb-1">
            <span className="text-muted-foreground">
              TBO {tbo.toLocaleString()} h
            </span>
            <span
              className="tabular-nums text-foreground"
              style={{ fontWeight: 700 }}
            >
              {pct != null ? `${pct}%` : '—'}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${progressColor(pct ?? null)}`}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCards({ data }: { data: TimeComparisonData }) {
  return (
    <div className="flex flex-wrap gap-3">
      <SummaryCard
        label="Airframe"
        icon={Plane}
        primary={data.airframe?.ttaf}
        primaryLabel="Total time (TTAF)"
      />
      <SummaryCard
        label="Engine"
        icon={Cog}
        primary={data.engine?.smoh}
        primaryLabel="Since major overhaul (SMOH)"
        tbo={data.engine?.tbo}
        pct={data.engine?.pct}
      />
      <SummaryCard
        label="Propeller"
        icon={Fan}
        primary={data.prop?.spoh}
        primaryLabel="Since overhaul (SPOH)"
        tbo={data.prop?.tbo}
        pct={data.prop?.pct}
      />
    </div>
  )
}

// --- Section 2: Horizontal-bar timeline ------------------------------------

function TimelineCard({ data }: { data: TimeComparisonData }) {
  const ttaf = data.airframe?.ttaf ?? null
  const smoh = data.engine?.smoh ?? null
  const installTach = data.engine?.install_tach ?? null
  const spoh = data.prop?.spoh ?? null

  // Engine start point on the airframe span: prefer the install tach, else
  // derive it from TTAF − SMOH.
  const engineStart =
    installTach != null
      ? installTach
      : ttaf != null && smoh != null
      ? Math.max(0, ttaf - smoh)
      : null
  // Prop start point derived from TTAF − SPOH.
  const propStart = ttaf != null && spoh != null ? Math.max(0, ttaf - spoh) : null

  const pos = (h: number | null) =>
    ttaf != null && ttaf > 0 && h != null ? Math.min(100, Math.max(0, (h / ttaf) * 100)) : null

  const enginePos = pos(engineStart)
  const propPos = pos(propStart)

  return (
    <section className="print-card rounded-xl border border-border bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <GitCompare className="h-4 w-4 text-primary" />
        <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          Time Comparison Timeline
        </h2>
      </div>

      {ttaf == null ? (
        <p className="text-[12.5px] italic text-muted-foreground">
          Total airframe time could not be determined from the records — timeline
          unavailable.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Airframe span — full width */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] mb-1">
              <span className="text-muted-foreground" style={{ fontWeight: 600 }}>
                Airframe
              </span>
              <span className="tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                0 → {ttaf.toLocaleString()} h
              </span>
            </div>
            <div className="relative h-7 rounded-md bg-primary/15 border border-primary/20">
              {/* Engine start marker */}
              {enginePos != null && (
                <div
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                  style={{ left: `${enginePos}%` }}
                >
                  <div className="w-0.5 h-full bg-emerald-600" />
                </div>
              )}
              {/* Prop start marker */}
              {propPos != null && (
                <div
                  className="absolute top-0 bottom-0 flex flex-col items-center"
                  style={{ left: `${propPos}%` }}
                >
                  <div className="w-0.5 h-full bg-violet-600" />
                </div>
              )}
            </div>
          </div>

          {/* Engine span — starts at engine install point */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] mb-1">
              <span className="text-emerald-700" style={{ fontWeight: 600 }}>
                Engine (since overhaul)
              </span>
              <span className="tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                {smoh != null ? `${smoh.toLocaleString()} h SMOH` : 'SMOH unknown'}
              </span>
            </div>
            <div className="relative h-5 rounded-md bg-muted">
              {enginePos != null && (
                <div
                  className="absolute top-0 bottom-0 rounded-md bg-emerald-500/70"
                  style={{ left: `${enginePos}%`, right: 0 }}
                />
              )}
            </div>
          </div>

          {/* Prop span — starts at prop overhaul point */}
          <div>
            <div className="flex items-center justify-between text-[10.5px] mb-1">
              <span className="text-violet-700" style={{ fontWeight: 600 }}>
                Propeller (since overhaul)
              </span>
              <span className="tabular-nums text-foreground" style={{ fontWeight: 600 }}>
                {spoh != null ? `${spoh.toLocaleString()} h SPOH` : 'SPOH unknown'}
              </span>
            </div>
            <div className="relative h-5 rounded-md bg-muted">
              {propPos != null && (
                <div
                  className="absolute top-0 bottom-0 rounded-md bg-violet-500/70"
                  style={{ left: `${propPos}%`, right: 0 }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary/40" /> Airframe life
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-emerald-600" /> Engine overhaul / install
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-0.5 bg-violet-600" /> Prop overhaul
            </span>
          </div>
          {(enginePos != null || propPos != null) && (
            <p className="text-[11px] italic text-muted-foreground">
              Markers placed on the airframe span show where the engine and prop began
              their current service life — a marker well to the right of zero indicates a
              mid-life replacement.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// --- Section 3: Discrepancy Analysis ---------------------------------------

const SEVERITY_META: Record<
  Severity,
  { label: string; badge: string; icon: typeof Info; iconColor: string }
> = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-50 text-red-700 border-red-200',
    icon: AlertOctagon,
    iconColor: 'text-red-500',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
  },
  info: {
    label: 'Info',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: Info,
    iconColor: 'text-sky-500',
  },
}

function DiscrepancyCard({ discrepancies }: { discrepancies: Discrepancy[] }) {
  return (
    <section className="print-card rounded-xl border border-border bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-primary" />
        <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          Discrepancy Analysis
        </h2>
      </div>
      <div className="space-y-2">
        {discrepancies.map((d, i) => {
          const meta = SEVERITY_META[d.severity] ?? SEVERITY_META.info
          const Icon = meta.icon
          return (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/10 p-3"
            >
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.iconColor}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12.5px] text-foreground" style={{ fontWeight: 700 }}>
                    {d.title}
                  </span>
                  <span
                    className={`text-[9.5px] uppercase tracking-wide rounded-full border px-1.5 py-0.5 ${meta.badge}`}
                    style={{ fontWeight: 700 }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-[12px] text-foreground/85 leading-relaxed mt-0.5 whitespace-pre-wrap">
                  {d.detail}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// --- Section 4: Time Since Key Events --------------------------------------

function TimeSinceCard({ rows }: { rows: TimeSinceRow[] }) {
  return (
    <section className="print-card rounded-xl border border-border bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="h-4 w-4 text-primary" />
        <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          Time Since Key Events
        </h2>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-muted/30 text-muted-foreground">
              <th
                className="text-left px-3 py-2 text-[10px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Event
              </th>
              <th
                className="text-right px-3 py-2 text-[10px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Hours
              </th>
              <th
                className="text-right px-3 py-2 text-[10px] uppercase tracking-wide"
                style={{ fontWeight: 700 }}
              >
                Calendar
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={i % 2 === 1 ? 'bg-muted/10' : ''}>
                <td className="px-3 py-2 text-foreground" style={{ fontWeight: 600 }}>
                  {r.label}
                </td>
                {r.found ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {r.hours != null ? `${r.hours.toLocaleString()} h` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {r.calendar || '—'}
                    </td>
                  </>
                ) : (
                  <td
                    className="px-3 py-2 text-right italic text-muted-foreground"
                    colSpan={2}
                  >
                    Not found in records
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
