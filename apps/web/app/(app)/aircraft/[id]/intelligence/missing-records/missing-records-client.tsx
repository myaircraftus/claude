'use client'

/**
 * Missing Records Detector — client view.
 *
 * Runs the 8-check scan via POST /api/intelligence/missing-records, renders
 * findings severity-sorted (critical → warning → info), and offers a
 * per-finding "Request Records" template plus a print-to-PDF export.
 */
import { useMemo, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import type { IntelligenceCitation, IntelligenceSeverity } from '@/lib/intelligence/types'
import { toast } from 'sonner'
import {
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  ScanSearch,
  RefreshCw,
  Printer,
  FileText,
  Copy,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react'

// --- Types -----------------------------------------------------------------

export interface MissingRecordFinding {
  id: string
  severity: IntelligenceSeverity
  title: string
  detail: string
  why_it_matters: string
  what_to_look_for: string
  citations: IntelligenceCitation[]
}

export interface MissingRecordsReport {
  module: 'missing-records'
  aircraft_id: string
  generated_at: string
  cached: boolean
  data:
    | { empty: true }
    | {
        findings: MissingRecordFinding[]
        counts: { critical: number; warning: number; info: number }
      }
}

// --- Severity presentation -------------------------------------------------

const SEVERITY_ORDER: Record<IntelligenceSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

const SEVERITY_UI: Record<
  IntelligenceSeverity,
  {
    label: string
    cardBorder: string
    cardBg: string
    badge: string
    icon: typeof XCircle
    iconColor: string
    headerColor: string
  }
> = {
  critical: {
    label: 'Critical',
    cardBorder: 'border-l-red-500 border-red-200',
    cardBg: 'bg-red-50/60',
    badge: 'bg-red-100 text-red-800',
    icon: XCircle,
    iconColor: 'text-red-500',
    headerColor: 'text-red-700',
  },
  warning: {
    label: 'Warning',
    cardBorder: 'border-l-amber-500 border-amber-200',
    cardBg: 'bg-amber-50/60',
    badge: 'bg-amber-100 text-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    headerColor: 'text-amber-700',
  },
  info: {
    label: 'Info',
    cardBorder: 'border-l-slate-400 border-slate-200',
    cardBg: 'bg-slate-50/60',
    badge: 'bg-slate-100 text-slate-700',
    icon: Info,
    iconColor: 'text-slate-500',
    headerColor: 'text-slate-600',
  },
}

// --- Helpers ---------------------------------------------------------------

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'recently'
  const diff = Date.now() - then
  if (diff < 60_000) return 'just now'
  const mins = Math.round(diff / 60_000)
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function requestTemplate(finding: MissingRecordFinding): string {
  return [
    'Subject: Aircraft records request — possible missing documentation',
    '',
    'Hello,',
    '',
    'A records review of this aircraft surfaced the following item that may',
    'indicate missing documentation:',
    '',
    `  • ${finding.title}`,
    `    ${finding.detail.replace(/\s+/g, ' ').trim()}`,
    '',
    'Could you please locate and provide:',
    `  ${finding.what_to_look_for.replace(/\s+/g, ' ').trim()}`,
    '',
    'If the records exist on paper, a clear scan or photo is fine. If they',
    'cannot be located, please let us know so we can plan next steps.',
    '',
    'Thank you,',
  ].join('\n')
}

// --- Request Records modal -------------------------------------------------

function RequestRecordsModal({
  finding,
  onClose,
}: {
  finding: MissingRecordFinding
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const template = useMemo(() => requestTemplate(finding), [finding])

  async function copy() {
    try {
      await navigator.clipboard.writeText(template)
      setCopied(true)
      toast.success('Template copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select the text and copy manually.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span
              className="text-[13px] text-foreground truncate"
              style={{ fontWeight: 600 }}
            >
              Request Records
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-[11px] text-muted-foreground mb-2">
            A draft message you can send to the seller, broker, or previous
            owner. This is a template only — nothing is sent.
          </p>
          <pre className="max-h-72 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">
            {template}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={copy}>
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy template
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// --- Finding card ----------------------------------------------------------

function FindingCard({
  finding,
  onRequest,
}: {
  finding: MissingRecordFinding
  onRequest: (f: MissingRecordFinding) => void
}) {
  const ui = SEVERITY_UI[finding.severity]
  const Icon = ui.icon
  return (
    <div
      className={`rounded-lg border border-l-4 ${ui.cardBorder} ${ui.cardBg} p-4`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${ui.iconColor}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${ui.badge}`}
              style={{ fontWeight: 700 }}
            >
              {ui.label}
            </span>
            <span
              className="text-[14px] text-foreground"
              style={{ fontWeight: 600 }}
            >
              {finding.title}
            </span>
          </div>

          <p className="text-[12px] text-foreground mt-2 leading-relaxed whitespace-pre-wrap">
            {finding.detail}
          </p>

          <div className="mt-3 grid gap-2.5">
            <div>
              <div
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
                style={{ fontWeight: 600 }}
              >
                Why it matters
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                {finding.why_it_matters}
              </p>
            </div>
            <div>
              <div
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
                style={{ fontWeight: 600 }}
              >
                What to look for
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
                {finding.what_to_look_for}
              </p>
            </div>
          </div>

          <CitationChips citations={finding.citations} />

          <div className="mt-3 print:hidden">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => onRequest(finding)}
            >
              <FileText className="h-3 w-3 mr-1.5" />
              Request Records
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Main client -----------------------------------------------------------

export function MissingRecordsClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: MissingRecordsReport | null
}) {
  const [report, setReport] = useState<MissingRecordsReport | null>(initialReport)
  const [loading, setLoading] = useState(false)
  const [modalFinding, setModalFinding] = useState<MissingRecordFinding | null>(null)

  async function runScan(regenerate: boolean) {
    setLoading(true)
    try {
      const res = await fetch('/api/intelligence/missing-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) {
        let msg = 'The scan could not be completed. Please try again shortly.'
        if (res.status === 403) {
          msg = 'This module is owner-only.'
        }
        toast.error(msg)
        return
      }
      const json = (await res.json()) as MissingRecordsReport
      setReport(json)
      if (json.cached && !regenerate) {
        toast.success('Loaded the most recent scan.')
      } else {
        toast.success('Missing-records scan complete.')
      }
    } catch {
      toast.error('Something went wrong running the scan. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const hasReport = report != null
  const isEmpty = hasReport && 'empty' in report!.data
  const findings =
    hasReport && !isEmpty
      ? [...(report!.data as { findings: MissingRecordFinding[] }).findings].sort(
          (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
        )
      : []
  const counts =
    hasReport && !isEmpty
      ? (report!.data as { counts: { critical: number; warning: number; info: number } })
          .counts
      : { critical: 0, warning: 0, info: 0 }

  const grouped: Array<{ severity: IntelligenceSeverity; items: MissingRecordFinding[] }> = (
    ['critical', 'warning', 'info'] as IntelligenceSeverity[]
  )
    .map((sev) => ({
      severity: sev,
      items: findings.filter((f) => f.severity === sev),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div>
      {/* Print styling — keeps the export clean. */}
      <style jsx global>{`
        @media print {
          .mr-no-print {
            display: none !important;
          }
          .mr-print-card {
            break-inside: avoid;
            box-shadow: none !important;
          }
        }
      `}</style>

      {/* --- Action bar --- */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 mr-no-print">
        <div className="text-[12px] text-muted-foreground">
          {hasReport ? (
            <span>
              Generated {relativeTime(report!.generated_at)}
              {report!.cached ? ' · cached' : ''}
            </span>
          ) : (
            <span>
              Runs 8 safety checks over this aircraft&apos;s uploaded records.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasReport && !isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={loading}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" />
              Export PDF
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => runScan(hasReport)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Scanning…
              </>
            ) : hasReport ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Regenerate
              </>
            ) : (
              <>
                <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
                Run Missing Records Scan
              </>
            )}
          </Button>
        </div>
      </div>

      {/* --- Loading state --- */}
      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center mr-no-print">
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
            Scanning records for gaps and anomalies…
          </p>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            Checking annual continuity, tach gaps, engine &amp; prop logbooks,
            post-strike inspections, STC paperwork, and overhaul records.
          </p>
        </div>
      )}

      {/* --- No report yet --- */}
      {!loading && !hasReport && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
            <ScanSearch className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
            No scan run yet
          </p>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            Run the detector to surface annual gaps, unexplained tach jumps,
            missing engine/prop logbooks, missing post-strike inspections, and
            unmatched STC / overhaul paperwork.
          </p>
        </div>
      )}

      {/* --- Empty: no documents --- */}
      {!loading && isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
            No documents to analyze
          </p>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            The Missing Records Detector needs uploaded records to scan. Add this
            aircraft&apos;s logbooks and documents first.
          </p>
          <Link
            href={`/aircraft/${aircraftId}/documents`}
            className="mt-1 text-xs text-primary hover:underline"
            style={{ fontWeight: 600 }}
          >
            Go to Documents
          </Link>
        </div>
      )}

      {/* --- Results --- */}
      {!loading && hasReport && !isEmpty && (
        <div>
          {/* Counts summary */}
          <div className="flex items-center gap-2 flex-wrap mb-4 mr-print-card">
            {findings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span
                  className="text-[12px] text-emerald-800"
                  style={{ fontWeight: 600 }}
                >
                  No missing-record issues detected across all 8 checks.
                </span>
              </div>
            ) : (
              (['critical', 'warning', 'info'] as IntelligenceSeverity[]).map(
                (sev) => {
                  const ui = SEVERITY_UI[sev]
                  const n = counts[sev]
                  return (
                    <span
                      key={sev}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${ui.badge}`}
                      style={{ fontWeight: 600 }}
                    >
                      {n} {ui.label}
                      {n === 1 ? '' : 's'}
                    </span>
                  )
                },
              )
            )}
          </div>

          {findings.length === 0 && (
            <p className="text-[11px] text-muted-foreground mb-4">
              This does not guarantee the records are complete — it means none of
              the 8 automated checks found a gap. Always cross-check against the
              physical logbooks.
            </p>
          )}

          {/* Severity-grouped findings */}
          <div className="space-y-6">
            {grouped.map((group) => {
              const ui = SEVERITY_UI[group.severity]
              return (
                <div key={group.severity}>
                  <div
                    className={`text-[12px] uppercase tracking-wide mb-2 ${ui.headerColor}`}
                    style={{ fontWeight: 700 }}
                  >
                    {ui.label} · {group.items.length}
                  </div>
                  <div className="space-y-3">
                    {group.items.map((f) => (
                      <div key={f.id} className="mr-print-card">
                        <FindingCard finding={f} onRequest={setModalFinding} />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modalFinding && (
        <RequestRecordsModal
          finding={modalFinding}
          onClose={() => setModalFinding(null)}
        />
      )}
    </div>
  )
}
