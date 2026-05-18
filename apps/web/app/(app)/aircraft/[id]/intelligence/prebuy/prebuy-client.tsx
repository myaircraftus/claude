'use client'

/**
 * Prebuy Report module — interactive client.
 *
 * Runs the 7-section pre-purchase evaluation via POST /api/intelligence/prebuy,
 * renders a GREEN / YELLOW / RED risk badge, collapsible per-section cards with
 * status badges + source citations, and supports regenerate + print-to-PDF.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import { QualityBadge } from '@/components/intelligence/QualityBadge'
import type {
  IntelligenceCitation,
  IntelligenceStatus,
  IntelligenceRisk,
} from '@/lib/intelligence/types'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'
import {
  ClipboardCheck,
  RefreshCw,
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Shield,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────

export interface PrebuySection {
  id: string
  title: string
  status: IntelligenceStatus
  summary: string
  citations: IntelligenceCitation[]
}

export interface PrebuyReport {
  module: 'prebuy'
  aircraft_id: string
  generated_at: string
  cached: boolean
  quality_score?: IntelligenceQualityScore
  data:
    | { empty: true }
    | {
        risk: IntelligenceRisk
        flagCount: number
        reviewCount: number
        sections: PrebuySection[]
      }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'recently'
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const STATUS_META: Record<
  IntelligenceStatus,
  { label: string; icon: typeof CheckCircle2; chip: string }
> = {
  pass: {
    label: '✓ Pass',
    icon: CheckCircle2,
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  review: {
    label: '⚠ Review',
    icon: AlertTriangle,
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  flag: {
    label: '✗ Flag',
    icon: XCircle,
    chip: 'bg-red-50 text-red-700 border-red-200',
  },
}

const RISK_META: Record<
  IntelligenceRisk,
  { label: string; icon: typeof Shield; band: string; text: string; dot: string }
> = {
  green: {
    label: 'GREEN',
    icon: ShieldCheck,
    band: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  yellow: {
    label: 'YELLOW',
    icon: Shield,
    band: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
  },
  red: {
    label: 'RED',
    icon: ShieldAlert,
    band: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },
}

const LOADING_STEPS = [
  'Scanning logbook continuity…',
  'Assessing engine & propeller health…',
  'Checking for damage history…',
  'Verifying AD compliance…',
  'Cross-checking STCs & modifications…',
  'Auditing records completeness…',
  'Computing overall risk score…',
]

// ─── Section card ─────────────────────────────────────────────────────────

function SectionCard({ section }: { section: PrebuySection }) {
  const [open, setOpen] = useState(true)
  const meta = STATUS_META[section.status]
  const Icon = meta.icon

  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <Icon
          className={`h-4 w-4 shrink-0 ${
            section.status === 'pass'
              ? 'text-emerald-600'
              : section.status === 'review'
                ? 'text-amber-600'
                : 'text-red-600'
          }`}
        />
        <span className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
          {section.title}
        </span>
        <span
          className={`ml-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.chip}`}
          style={{ fontWeight: 700 }}
        >
          {meta.label}
        </span>
        <ChevronDown
          className={`h-4 w-4 ml-auto shrink-0 text-muted-foreground/60 transition-transform ${
            open ? 'rotate-180' : ''
          } print:hidden`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border/60">
          <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line">
            {section.summary}
          </p>
          <CitationChips citations={section.citations} />
        </div>
      )}
    </div>
  )
}

// ─── Main client ──────────────────────────────────────────────────────────

export function PrebuyClient({
  aircraftId,
  tailNumber,
  initialReport,
}: {
  aircraftId: string
  tailNumber: string
  initialReport: PrebuyReport | null
}) {
  const [report, setReport] = useState<PrebuyReport | null>(initialReport)
  const [running, setRunning] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  async function runAnalysis(regenerate: boolean) {
    setRunning(true)
    setStepIndex(0)
    const ticker = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, LOADING_STEPS.length - 1))
    }, 1400)

    try {
      const res = await fetch('/api/intelligence/prebuy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) {
        if (res.status === 403) {
          toast.error('The Prebuy Report is owner-only.')
        } else if (res.status === 404) {
          toast.error('Aircraft not found.')
        } else {
          toast.error('Could not run the prebuy analysis. Please try again.')
        }
        return
      }
      const data = (await res.json()) as PrebuyReport
      setReport(data)
      if ('empty' in data.data && data.data.empty) {
        toast.message('No documents found for this aircraft yet.')
      } else if (data.cached && !regenerate) {
        toast.success('Loaded the most recent prebuy report.')
      } else {
        toast.success('Prebuy analysis complete.')
      }
    } catch {
      toast.error('Could not reach the analysis service. Please try again.')
    } finally {
      clearInterval(ticker)
      setRunning(false)
    }
  }

  const hasReport = report !== null
  const isEmpty = hasReport && 'empty' in report!.data && report!.data.empty
  const reportData =
    hasReport && !isEmpty
      ? (report!.data as {
          risk: IntelligenceRisk
          flagCount: number
          reviewCount: number
          sections: PrebuySection[]
        })
      : null

  return (
    <div className="max-w-4xl mx-auto">
      {/* Print stylesheet — hides chrome, expands cards. */}
      <style>{`
        @media print {
          .prebuy-no-print { display: none !important; }
          .prebuy-print-block { break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ClipboardCheck className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="text-[20px] tracking-tight text-foreground"
            style={{ fontWeight: 700 }}
          >
            Prebuy Report
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {tailNumber} — a neutral, flags-focused pre-purchase evaluation across
            logbooks, engine &amp; prop, damage history, ADs, STCs, and records.
          </p>
        </div>
        {hasReport && !running && (
          <div className="flex items-center gap-2 prebuy-no-print">
            <Button variant="outline" size="sm" onClick={() => runAnalysis(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Re-run
            </Button>
            {!isEmpty && (
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Export PDF
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Running — animated loading steps */}
      {running && (
        <div className="rounded-xl border border-border bg-white p-8 prebuy-no-print">
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
            <span
              className="text-[14px] text-foreground"
              style={{ fontWeight: 600 }}
            >
              Running prebuy analysis…
            </span>
          </div>
          <ul className="space-y-2">
            {LOADING_STEPS.map((step, i) => (
              <li
                key={step}
                className={`flex items-center gap-2 text-[12px] transition-colors ${
                  i < stepIndex
                    ? 'text-emerald-600'
                    : i === stepIndex
                      ? 'text-foreground'
                      : 'text-muted-foreground/50'
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : i === stepIndex ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-current/40" />
                )}
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No report yet — prompt to run */}
      {!running && !hasReport && (
        <div className="rounded-xl border border-border bg-white py-14 px-6 text-center prebuy-no-print">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <p
            className="mt-3 text-sm text-foreground"
            style={{ fontWeight: 600 }}
          >
            Run a prebuy analysis for {tailNumber}
          </p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            We&apos;ll review this aircraft&apos;s uploaded records and produce a
            GREEN / YELLOW / RED risk score with flags-focused notes across seven
            areas.
          </p>
          <Button className="mt-4" onClick={() => runAnalysis(false)}>
            <ClipboardCheck className="h-4 w-4" />
            Run Prebuy Analysis
          </Button>
        </div>
      )}

      {/* Empty — no documents */}
      {!running && isEmpty && (
        <div className="rounded-xl border border-border bg-white py-14 px-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p
            className="mt-3 text-sm text-foreground"
            style={{ fontWeight: 600 }}
          >
            No records to analyze yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            A prebuy report needs this aircraft&apos;s logbooks and maintenance
            records. Upload documents, then run the analysis.
          </p>
          <Link
            href={`/aircraft/${aircraftId}/documents`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
            style={{ fontWeight: 500 }}
          >
            <FileText className="h-4 w-4" />
            Go to Documents
          </Link>
        </div>
      )}

      {/* Report */}
      {!running && reportData && (
        <div className="space-y-4">
          <QualityBadge score={report?.quality_score} />
          {/* Risk badge */}
          {(() => {
            const rm = RISK_META[reportData.risk]
            const RiskIcon = rm.icon
            return (
              <div
                className={`rounded-xl border p-5 flex items-center gap-4 prebuy-print-block ${rm.band}`}
              >
                <div
                  className={`w-14 h-14 rounded-2xl bg-white/70 flex items-center justify-center shrink-0 ${rm.text}`}
                >
                  <RiskIcon className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${rm.dot}`} />
                    <span
                      className={`text-[18px] tracking-tight ${rm.text}`}
                      style={{ fontWeight: 800 }}
                    >
                      {rm.label} RISK
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {reportData.flagCount} item
                    {reportData.flagCount === 1 ? '' : 's'} flagged as concern
                    {reportData.flagCount === 1 ? '' : 's'},{' '}
                    {reportData.reviewCount} flagged for review. Automated,
                    records-based screen — not a substitute for a physical
                    inspection.
                  </p>
                </div>
              </div>
            )
          })()}

          {/* Section cards */}
          <div className="space-y-3">
            {reportData.sections.map((section) => (
              <div key={section.id} className="prebuy-print-block">
                <SectionCard section={section} />
              </div>
            ))}
          </div>

          {/* Footer — generated time + actions */}
          <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
            <span>
              Generated {relativeTime(report!.generated_at)}
              {report!.cached ? ' · cached' : ''}
            </span>
            <div className="flex items-center gap-2 ml-auto prebuy-no-print">
              <button
                type="button"
                onClick={() => runAnalysis(true)}
                className="inline-flex items-center gap-1 text-primary hover:underline"
                style={{ fontWeight: 600 }}
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate
              </button>
              <span className="text-border">·</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 text-primary hover:underline"
                style={{ fontWeight: 600 }}
              >
                <Printer className="h-3 w-3" />
                Export PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
