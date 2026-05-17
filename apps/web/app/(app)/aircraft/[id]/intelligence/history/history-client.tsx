'use client'

/**
 * Full History Package — client surface.
 *
 * Renders the cached/generated history report as six titled cards, each
 * ending with its source citations. Handles (re)generation against
 * POST /api/intelligence/history with an animated progress indicator, an
 * empty state, and a print-friendly "Export PDF" path.
 */
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, FileText, History, ShieldCheck, AlertTriangle,
  Plane, Activity, ClipboardList, FileSearch, Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import type { IntelligenceCitation } from '@/lib/intelligence/types'

// --- Report shape (mirrors the API route's HistoryData) --------------------
interface Section {
  text: string
  citations: IntelligenceCitation[]
}
interface IdentityHeader {
  tail_number: string | null
  serial_number: string | null
  make: string | null
  model: string | null
  year: number | null
  total_time_hours: number | null
}
interface HistoryData {
  empty?: boolean
  identity?: Section & { header: IdentityHeader }
  timeline?: Section & {
    annuals: Section
    overhauls: Section
    hundred_hour: Section
  }
  ad_compliance?: Section
  damage?: Section
  current_status?: Section & {
    open_squawks: Array<{ id: string; title: string; severity: string | null; status: string | null }>
  }
  document_completeness?: { present: string[]; missing: string[]; doc_types: string[] }
}
export interface HistoryReport {
  module: 'history'
  aircraft_id: string
  generated_at: string
  data: HistoryData
  cached: boolean
}

const PROGRESS_STEPS = [
  'Analyzing logbooks…',
  'Checking AD compliance…',
  'Compiling STCs and 337s…',
  'Generating summary…',
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

export function HistoryClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: HistoryReport | null
}) {
  const [report, setReport] = useState<HistoryReport | null>(initialReport)
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
      const res = await fetch('/api/intelligence/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as HistoryReport
      setReport(json)
    } catch {
      toast.error('Could not generate the report. Please try again.')
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
              <History className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Full History Package
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${relativeTime(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'A complete, source-cited maintenance history.'}
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
              Reading every logbook entry and cross-referencing AD compliance — this
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
              The History Package is built from this aircraft&apos;s uploaded logbooks
              and records. Upload documents to generate the report.
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
              <History className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Generate the Full History Package
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll read every uploaded record and assemble a cited history —
                identity, inspection timeline, ADs, damage, status, and records.
              </p>
            </div>
            <Button onClick={() => generate(false)}>
              <History className="h-4 w-4 mr-1.5" />
              Generate History Package
            </Button>
          </div>
        )}

        {/* Report */}
        {!loading && hasReport && data && (
          <div className="space-y-4">
            <IdentityCard section={data.identity} />
            <TimelineCard section={data.timeline} />
            <NarrativeCard
              title="AD Compliance Summary"
              icon={ShieldCheck}
              section={data.ad_compliance}
            />
            <NarrativeCard
              title="Damage & Incidents"
              icon={AlertTriangle}
              section={data.damage}
            />
            <CurrentStatusCard section={data.current_status} aircraftId={aircraftId} />
            <CompletenessCard completeness={data.document_completeness} />
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
  icon: typeof History
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

/** A narrative paragraph, or an "insufficient records" fallback. */
function Narrative({ text }: { text: string | undefined }) {
  if (!text || !text.trim()) {
    return (
      <p className="text-[12.5px] italic text-muted-foreground">
        Insufficient records to analyze this section.
      </p>
    )
  }
  return (
    <p className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{text}</p>
  )
}

function NarrativeCard({
  title,
  icon,
  section,
}: {
  title: string
  icon: typeof History
  section: Section | undefined
}) {
  return (
    <Card title={title} icon={icon}>
      <Narrative text={section?.text} />
      <CitationChips citations={section?.citations ?? []} />
    </Card>
  )
}

function IdentityCard({
  section,
}: {
  section: (Section & { header: IdentityHeader }) | undefined
}) {
  const header = section?.header
  const rows: Array<[string, string]> = [
    ['Registration', header?.tail_number || '—'],
    ['Serial Number', header?.serial_number || '—'],
    ['Make / Model', [header?.make, header?.model].filter(Boolean).join(' ') || '—'],
    ['Year', header?.year != null ? String(header.year) : '—'],
    [
      'Total Airframe Time',
      header?.total_time_hours != null ? `${header.total_time_hours} hrs` : '—',
    ],
  ]
  return (
    <Card title="Identity" icon={Plane}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mb-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
              {label}
            </div>
            <div className="text-[13px] text-foreground tabular-nums" style={{ fontWeight: 600 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
      <Narrative text={section?.text} />
      <CitationChips citations={section?.citations ?? []} />
    </Card>
  )
}

function TimelineSub({ label, section }: { label: string; section: Section | undefined }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <Narrative text={section?.text} />
      <CitationChips citations={section?.citations ?? []} />
    </div>
  )
}

function TimelineCard({
  section,
}: {
  section: (Section & { annuals: Section; overhauls: Section; hundred_hour: Section }) | undefined
}) {
  return (
    <Card title="Maintenance Timeline" icon={Activity}>
      <Narrative text={section?.text} />
      <div className="mt-3 space-y-3">
        <TimelineSub label="Annual Inspections" section={section?.annuals} />
        <TimelineSub label="100-Hour Inspections" section={section?.hundred_hour} />
        <TimelineSub label="Engine / Prop Overhauls & Major Work" section={section?.overhauls} />
      </div>
    </Card>
  )
}

function CurrentStatusCard({
  section,
  aircraftId,
}: {
  section: (Section & { open_squawks: Array<{ id: string; title: string; severity: string | null; status: string | null }> }) | undefined
  aircraftId: string
}) {
  const squawks = section?.open_squawks ?? []
  return (
    <Card title="Current Status" icon={ClipboardList}>
      <Narrative text={section?.text} />
      <div className="mt-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
          Open Squawks ({squawks.length})
        </div>
        {squawks.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No open squawks on this aircraft.</p>
        ) : (
          <ul className="space-y-1.5">
            {squawks.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/10 px-2.5 py-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[12.5px] text-foreground truncate" style={{ fontWeight: 600 }}>
                  {s.title}
                </span>
                {s.severity && (
                  <span className="ml-auto text-[10.5px] text-muted-foreground capitalize shrink-0">
                    {s.severity}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <CitationChips citations={section?.citations ?? []} />
    </Card>
  )
}

function CompletenessCard({
  completeness,
}: {
  completeness: { present: string[]; missing: string[]; doc_types: string[] } | undefined
}) {
  const present = completeness?.present ?? []
  const missing = completeness?.missing ?? []
  return (
    <Card title="Document Completeness" icon={FileText}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-emerald-600 mb-1.5" style={{ fontWeight: 600 }}>
            Present ({present.length})
          </div>
          {present.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">None detected.</p>
          ) : (
            <ul className="space-y-1">
              {present.map((d) => (
                <li key={d} className="text-[12.5px] text-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-amber-600 mb-1.5" style={{ fontWeight: 600 }}>
            Missing ({missing.length})
          </div>
          {missing.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">All expected records present.</p>
          ) : (
            <ul className="space-y-1">
              {missing.map((d) => (
                <li key={d} className="text-[12.5px] text-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {d}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-2.5 text-[11px] italic text-muted-foreground">
        Based on document types uploaded for this aircraft.
      </p>
    </Card>
  )
}
