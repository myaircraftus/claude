'use client'

/**
 * AD / SB Traceability — client. Renders the cached report (or generates one)
 * showing every Airworthiness Directive found in the records, its compliance
 * evidence, recurring due dates, and gap flags. Filterable, expandable rows,
 * print-to-PDF. Analyzes uploaded records only — not the FAA AD database.
 */
import { Fragment, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import { QualityBadge } from '@/components/intelligence/QualityBadge'
import type { IntelligenceCitation } from '@/lib/intelligence/types'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'
import {
  ShieldCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Info,
  Printer,
  ChevronDown,
  FileText,
  CheckCircle2,
  RotateCw,
  AlertTriangle,
  XCircle,
} from 'lucide-react'

type AdType = 'one-time' | 'recurring'
type AdStatus = 'complied' | 'recurring' | 'overdue' | 'no-evidence'

interface TraceabilityAd {
  ad_number: string
  type: AdType
  last_compliance_date: string | null
  next_due: string | null
  evidence_excerpt: string
  status: AdStatus
}

interface AdTraceabilityData {
  empty?: boolean
  disclaimer?: string
  ads?: TraceabilityAd[]
  citations?: IntelligenceCitation[]
}

interface AdReport {
  module?: string
  aircraft_id?: string
  generated_at?: string
  cached?: boolean
  data?: AdTraceabilityData
  quality_score?: IntelligenceQualityScore
}

type FilterKey = 'all' | 'complied' | 'recurring' | 'flagged'

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'complied', label: 'Complied' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'flagged', label: 'Flagged' },
]

/** Human-friendly date, falling back to the raw string. */
function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "3 days ago" style relative label for the generated_at timestamp. */
function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** Status badge — emerald / blue / amber / red per the AD status. */
function StatusBadge({ ad }: { ad: TraceabilityAd }) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap'
  if (ad.status === 'complied') {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`} style={{ fontWeight: 600 }}>
        <CheckCircle2 className="h-3 w-3" /> Complied
      </span>
    )
  }
  if (ad.status === 'recurring') {
    return (
      <span className={`${base} bg-blue-50 text-blue-700`} style={{ fontWeight: 600 }}>
        <RotateCw className="h-3 w-3" /> Recurring — due {fmtDate(ad.next_due)}
      </span>
    )
  }
  if (ad.status === 'overdue') {
    return (
      <span className={`${base} bg-red-50 text-red-700`} style={{ fontWeight: 600 }}>
        <XCircle className="h-3 w-3" /> Overdue
      </span>
    )
  }
  return (
    <span className={`${base} bg-amber-50 text-amber-700`} style={{ fontWeight: 600 }}>
      <AlertTriangle className="h-3 w-3" /> No Evidence Found
    </span>
  )
}

export function AdTraceabilityClient({
  aircraftId,
  tailNumber,
  initialReport,
}: {
  aircraftId: string
  tailNumber: string
  initialReport: Record<string, unknown> | null
}) {
  const [report, setReport] = useState<AdReport | null>(
    (initialReport as AdReport | null) ?? null,
  )
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [expanded, setExpanded] = useState<number | null>(null)

  const data = report?.data
  const isEmpty = data?.empty === true
  const ads = data?.ads ?? []
  const citations = data?.citations ?? []

  async function generate(regenerate: boolean) {
    setLoading(true)
    try {
      const res = await fetch('/api/intelligence/ad-traceability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      const json = (await res.json().catch(() => null)) as AdReport & { error?: string }
      if (!res.ok || !json) {
        toast.error(json?.error ?? 'Could not generate AD traceability. Please try again.')
        return
      }
      setReport(json)
      setExpanded(null)
      if (json.data?.empty) {
        toast.message('No documents found for this aircraft yet.')
      } else {
        toast.success(
          regenerate ? 'AD traceability regenerated.' : 'AD traceability ready.',
        )
      }
    } catch {
      toast.error('Something went wrong generating the report.')
    } finally {
      setLoading(false)
    }
  }

  const counts = {
    all: ads.length,
    complied: ads.filter((a) => a.status === 'complied').length,
    recurring: ads.filter((a) => a.status === 'recurring').length,
    flagged: ads.filter((a) => a.status === 'overdue' || a.status === 'no-evidence').length,
  }

  const visibleAds = ads.filter((a) => {
    if (filter === 'all') return true
    if (filter === 'complied') return a.status === 'complied'
    if (filter === 'recurring') return a.status === 'recurring'
    return a.status === 'overdue' || a.status === 'no-evidence'
  })

  return (
    <div className="ad-traceability-root">
      {/* Print-only styling — keeps the export clean. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .ad-traceability-root, .ad-traceability-root * { visibility: visible; }
          .ad-traceability-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .ad-row-evidence { display: table-row !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1
              className="text-[20px] tracking-tight text-foreground"
              style={{ fontWeight: 700 }}
            >
              AD / SB Traceability
            </h1>
            <p className="text-[12px] text-muted-foreground">
              {tailNumber} — every Airworthiness Directive found in the uploaded records,
              mapped to compliance evidence.
            </p>
          </div>
        </div>
        <div className="no-print flex items-center gap-2 shrink-0">
          {report && !isEmpty && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.print()}
              disabled={loading}
            >
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Export PDF
            </Button>
          )}
          {report ? (
            <Button size="sm" onClick={() => generate(true)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {loading ? 'Working…' : 'Regenerate'}
            </Button>
          ) : (
            <Button size="sm" onClick={() => generate(false)} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {loading ? 'Analyzing records…' : 'Generate AD Traceability'}
            </Button>
          )}
        </div>
      </div>

      {/* Disclaimer banner — always shown once a report exists. */}
      {report && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-800 leading-relaxed">
            {data?.disclaimer ??
              'Based on uploaded maintenance records. Does not substitute for an official FAA AD compliance review.'}
          </p>
        </div>
      )}

      {/* Empty / no-report states */}
      {!report && !loading && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
            No AD traceability report yet
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            Generate a report to extract every Airworthiness Directive mentioned in this
            aircraft&apos;s records and map each to its compliance evidence.
          </p>
        </div>
      )}

      {loading && !report && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white py-16 px-6 text-center">
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
          <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
            Analyzing maintenance records…
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            Searching the records for AD references and matching compliance evidence. This
            can take a moment.
          </p>
        </div>
      )}

      {report && isEmpty && (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-white py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
            <FileText className="h-6 w-6 text-amber-500" />
          </div>
          <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
            No documents uploaded yet
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            AD traceability runs over this aircraft&apos;s uploaded maintenance records.
            Upload logbooks and maintenance documents to get started.
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

      {/* Report body */}
      {report && !isEmpty && (
        <>
          <QualityBadge score={report.quality_score} />

          {/* Filter row */}
          <div className="no-print mb-3 flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => {
              const isActive = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilter(f.key)
                    setExpanded(null)
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                  style={{ fontWeight: isActive ? 600 : 500 }}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      isActive ? 'bg-primary/15' : 'bg-muted'
                    }`}
                  >
                    {counts[f.key]}
                  </span>
                </button>
              )
            })}
          </div>

          {ads.length === 0 ? (
            <div className="rounded-xl border border-border bg-white py-12 px-6 text-center">
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                No Airworthiness Directives found in the records
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                The analysis did not find any AD references in this aircraft&apos;s uploaded
                documents. This does not mean none apply — confirm against an official FAA
                AD compliance review.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>AD Number</th>
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>Type</th>
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>Last Compliance</th>
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>Next Due</th>
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>Evidence</th>
                    <th className="px-3 py-2" style={{ fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAds.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        No ADs match this filter.
                      </td>
                    </tr>
                  ) : (
                    visibleAds.map((ad, i) => {
                      const isOpen = expanded === i
                      return (
                        <Fragment key={`${ad.ad_number}-${i}`}>
                          <tr className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors">
                            <td
                              className="px-3 py-2 text-foreground"
                              style={{ fontWeight: 600 }}
                            >
                              {ad.ad_number}
                            </td>
                            <td className="px-3 py-2 capitalize text-muted-foreground">
                              {ad.type}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {fmtDate(ad.last_compliance_date)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {fmtDate(ad.next_due)}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setExpanded(isOpen ? null : i)}
                                className="no-print inline-flex items-center gap-1 text-primary hover:underline"
                                style={{ fontWeight: 600 }}
                                disabled={!ad.evidence_excerpt}
                              >
                                {ad.evidence_excerpt ? 'View' : 'None'}
                                {ad.evidence_excerpt && (
                                  <ChevronDown
                                    className={`h-3 w-3 transition-transform ${
                                      isOpen ? 'rotate-180' : ''
                                    }`}
                                  />
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge ad={ad} />
                            </td>
                          </tr>
                          {(isOpen || false) && ad.evidence_excerpt && (
                            <tr className="ad-row-evidence border-b border-border/60 last:border-0 bg-muted/20">
                              <td colSpan={6} className="px-3 py-2.5">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
                                  Compliance evidence
                                </div>
                                <p className="text-[12px] text-muted-foreground leading-relaxed">
                                  &ldquo;{ad.evidence_excerpt}&rdquo;
                                </p>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Citations */}
          <div className="mt-4">
            <CitationChips citations={citations} label="Source records" />
          </div>

          {/* Footer meta */}
          <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>
              Generated {relativeTime(report.generated_at)}
              {report.cached ? ' · cached' : ''}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Printer className="h-3 w-3" /> Export PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}
