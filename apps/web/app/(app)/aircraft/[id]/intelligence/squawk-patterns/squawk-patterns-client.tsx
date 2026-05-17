'use client'

/**
 * Recurring Squawk Patterns — client surface.
 *
 * Renders the cached/generated report: recurring squawk clusters (sortable),
 * open-vs-resolved patterns, time-between-recurrences trend, maintenance-log
 * corroboration with citations, and per-cluster recommendations. Handles
 * (re)generation against POST /api/intelligence/squawk-patterns with an
 * animated progress indicator, an empty state, and a print-friendly
 * "Export PDF" path.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, Repeat, ClipboardList, Clock, FileSearch,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Lightbulb,
  ArrowDownWideNarrow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import type { IntelligenceCitation } from '@/lib/intelligence/types'

// --- Report shape (mirrors the API route's SquawkPatternsData) -------------
interface SquawkCluster {
  label: string
  count: number
  date_range: { first: string | null; last: string | null }
  last_occurrence: string | null
  open_count: number
  resolved_count: number
  reopen_count: number
  avg_days_between: number | null
  trend: 'more_frequent' | 'less_frequent' | 'steady' | 'insufficient'
  log_mentions: number
  recommendation: string
  citations: IntelligenceCitation[]
}
interface SquawkPatternsData {
  empty?: boolean
  clusters: SquawkCluster[]
  total_squawks: number
  log_corroboration?: { text: string; citations: IntelligenceCitation[] }
}
export interface SquawkPatternsReport {
  module: 'squawk-patterns'
  aircraft_id: string
  generated_at: string
  data: SquawkPatternsData
  cached: boolean
}

type SortKey = 'frequency' | 'recent' | 'unresolved'

const PROGRESS_STEPS = [
  'Reading squawk history…',
  'Clustering recurring problems…',
  'Cross-referencing maintenance logs…',
  'Generating recommendations…',
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

/** Short calendar date from an ISO timestamp. */
function shortDate(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return '—'
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SquawkPatternsClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: SquawkPatternsReport | null
}) {
  const [report, setReport] = useState<SquawkPatternsReport | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('frequency')
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
      const res = await fetch('/api/intelligence/squawk-patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as SquawkPatternsReport
      setReport(json)
    } catch {
      toast.error('Could not analyze squawk patterns. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const data = report?.data
  const hasReport = Boolean(report) && !data?.empty
  const clusters = data?.clusters ?? []

  const sortedClusters = useMemo(() => {
    const list = [...clusters]
    if (sortKey === 'recent') {
      list.sort((a, b) => {
        const ta = a.last_occurrence ? new Date(a.last_occurrence).getTime() : 0
        const tb = b.last_occurrence ? new Date(b.last_occurrence).getTime() : 0
        return tb - ta
      })
    } else if (sortKey === 'unresolved') {
      list.sort((a, b) => b.open_count - a.open_count || b.count - a.count)
    } else {
      list.sort((a, b) => b.count - a.count)
    }
    return list
  }, [clusters, sortKey])

  const totalLogMentions = clusters.reduce((sum, c) => sum + c.log_mentions, 0)

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
              <Repeat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Recurring Squawk Patterns
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${relativeTime(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'Find the problems that keep coming back.'}
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
              Grouping every squawk by underlying problem and checking the maintenance
              logs — this can take a minute.
            </p>
          </div>
        )}

        {/* Empty state — no squawks */}
        {!loading && data?.empty && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              No squawks recorded for this aircraft
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Recurring Squawk Patterns analyzes this aircraft&apos;s squawk history.
              Once squawks are logged, we&apos;ll surface the issues that keep coming back.
            </p>
          </div>
        )}

        {/* No report yet — first run */}
        {!loading && !report && (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-white py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Repeat className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Analyze Recurring Squawk Patterns
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll cluster this aircraft&apos;s squawks by underlying problem,
                flag the ones that keep returning, and corroborate them against the
                maintenance logs.
              </p>
            </div>
            <Button onClick={() => generate(false)}>
              <Repeat className="h-4 w-4 mr-1.5" />
              Analyze Squawk Patterns
            </Button>
          </div>
        )}

        {/* Report — clusters found */}
        {!loading && hasReport && data && clusters.length > 0 && (
          <div className="space-y-4">
            {/* (1) Recurring Squawk Clusters */}
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-primary" />
                  <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                    Recurring Squawk Clusters ({clusters.length})
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 no-print">
                  <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="text-[11.5px] rounded-md border border-border bg-white px-1.5 py-1 text-foreground"
                  >
                    <option value="frequency">Most frequent</option>
                    <option value="recent">Most recent</option>
                    <option value="unresolved">Most unresolved</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2.5">
                {sortedClusters.map((c, i) => (
                  <ClusterCard key={`${c.label}-${i}`} cluster={c} />
                ))}
              </div>
            </section>

            {/* (2) Open vs Resolved Patterns */}
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  Open vs Resolved Patterns
                </h2>
              </div>
              <ul className="space-y-1.5">
                {clusters.map((c, i) => (
                  <li
                    key={`${c.label}-ovr-${i}`}
                    className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12.5px] text-foreground capitalize" style={{ fontWeight: 600 }}>
                        {c.label}
                      </span>
                      <span className="text-[11.5px] text-amber-600" style={{ fontWeight: 600 }}>
                        {c.open_count} open
                      </span>
                      <span className="text-[11.5px] text-emerald-600" style={{ fontWeight: 600 }}>
                        {c.resolved_count} resolved
                      </span>
                    </div>
                    {c.reopen_count > 0 && (
                      <p className="mt-1 text-[11.5px] text-amber-600 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        This issue has been closed and reopened {c.reopen_count} time
                        {c.reopen_count === 1 ? '' : 's'}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* (3) Time Between Recurrences */}
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  Time Between Recurrences
                </h2>
              </div>
              <ul className="space-y-1.5">
                {clusters.map((c, i) => (
                  <li
                    key={`${c.label}-tbr-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2 flex-wrap"
                  >
                    <span className="text-[12.5px] text-foreground capitalize" style={{ fontWeight: 600 }}>
                      {c.label}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground tabular-nums">
                      {c.avg_days_between != null
                        ? `avg ${c.avg_days_between} days between recurrences`
                        : 'recurrence interval unavailable'}
                    </span>
                    <TrendBadge trend={c.trend} />
                  </li>
                ))}
              </ul>
            </section>

            {/* (4) Maintenance Log Corroboration */}
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-2.5">
                <FileSearch className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  Maintenance Log Corroboration
                </h2>
              </div>
              <div className="flex gap-4 mb-2.5">
                <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                    Squawk database
                  </div>
                  <div className="text-[16px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
                    {data.total_squawks}
                  </div>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                    Maintenance log mentions
                  </div>
                  <div className="text-[16px] text-foreground tabular-nums" style={{ fontWeight: 700 }}>
                    {totalLogMentions}
                  </div>
                </div>
              </div>
              {data.log_corroboration?.text && data.log_corroboration.text.trim() ? (
                <p className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {data.log_corroboration.text}
                </p>
              ) : (
                <p className="text-[12.5px] italic text-muted-foreground">
                  No corroborating maintenance-log entries found.
                </p>
              )}
              <CitationChips citations={data.log_corroboration?.citations ?? []} />
            </section>

            {/* (5) Recommendations */}
            <section className="print-card rounded-xl border border-border bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-4 w-4 text-primary" />
                <h2 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                  Recommendations
                </h2>
              </div>
              <ul className="space-y-2">
                {clusters.map((c, i) => (
                  <li
                    key={`${c.label}-rec-${i}`}
                    className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5"
                  >
                    <div className="text-[12px] uppercase tracking-wide text-primary mb-1" style={{ fontWeight: 600 }}>
                      {c.label}
                    </div>
                    <p className="text-[12.5px] text-foreground/90 leading-relaxed">
                      {c.recommendation}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* Report — squawks exist but no recurring pattern */}
        {!loading && hasReport && data && clusters.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
              No recurring patterns detected
            </p>
            <p className="text-xs text-muted-foreground max-w-sm">
              We reviewed {data.total_squawks} squawk{data.total_squawks === 1 ? '' : 's'} and
              found no problem that has recurred two or more times.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Sub-components --------------------------------------------------------

function TrendBadge({ trend }: { trend: SquawkCluster['trend'] }) {
  if (trend === 'more_frequent') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-amber-600" style={{ fontWeight: 600 }}>
        <TrendingUp className="h-3.5 w-3.5" />
        Getting more frequent
      </span>
    )
  }
  if (trend === 'less_frequent') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600" style={{ fontWeight: 600 }}>
        <TrendingDown className="h-3.5 w-3.5" />
        Getting less frequent
      </span>
    )
  }
  if (trend === 'steady') {
    return (
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground" style={{ fontWeight: 600 }}>
        <Minus className="h-3.5 w-3.5" />
        Steady cadence
      </span>
    )
  }
  return null
}

function ClusterCard({ cluster }: { cluster: SquawkCluster }) {
  const c = cluster
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <span className="text-[13px] text-foreground capitalize" style={{ fontWeight: 700 }}>
          {c.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary" style={{ fontWeight: 600 }}>
          {c.count}× recurring
        </span>
        {c.open_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600" style={{ fontWeight: 600 }}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {c.open_count} open
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600" style={{ fontWeight: 600 }}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            All resolved
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11.5px]">
        <Field label="Date Range" value={`${shortDate(c.date_range.first)} → ${shortDate(c.date_range.last)}`} />
        <Field label="Last Occurrence" value={shortDate(c.last_occurrence)} />
        <Field
          label="Avg Interval"
          value={c.avg_days_between != null ? `${c.avg_days_between} days` : '—'}
        />
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div className="text-[12px] text-foreground tabular-nums" style={{ fontWeight: 600 }}>
        {value}
      </div>
    </div>
  )
}
