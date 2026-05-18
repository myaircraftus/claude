'use client'

/**
 * Lender / Insurance Summary — client surface.
 *
 * Renders the cached/generated report as a formal, print-ready summary
 * package: an identity header block, an airworthiness status badge, title
 * indicators, a maintenance snapshot, incident history, and a documents-on-
 * file checklist. Handles (re)generation against POST
 * /api/intelligence/lender-summary with an animated progress indicator, an
 * empty state, an "Export as PDF" path (window.print) and a "Copy Summary
 * Text" path that copies a plain-text version to the clipboard.
 */
import { useEffect, useRef, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import {
  Loader2, RefreshCw, Printer, Copy, FileSearch, Upload, Landmark,
  Plane, ShieldCheck, ScrollText, Wrench, AlertTriangle, FileCheck2,
  CheckCircle2, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CitationChips } from '@/components/intelligence/CitationChips'
import { QualityBadge } from '@/components/intelligence/QualityBadge'
import type { IntelligenceCitation } from '@/lib/intelligence/types'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'

// --- Report shape (mirrors the API route's LenderSummaryData) --------------
interface LenderHeader {
  tail_number: string | null
  make: string | null
  model: string | null
  year: number | null
  serial_number: string | null
  prepared_by: string
  generated_date: string
}
interface AirworthinessSection {
  status: 'AIRWORTHY' | 'REQUIRES REVIEW'
  annual_current: boolean | null
  annual_expiration: string | null
  annual_note: string
  open_ad_count: number | null
  open_ad_note: string
  open_squawk_count: number
}
interface TitleSection {
  text: string
  form_337_count: number | null
  lien_note: string
}
interface MaintenanceSection {
  text: string
  years_of_records: number | null
}
interface IncidentSection {
  text: string
  damage_found: boolean
  note: string
}
interface DocumentsChecklistItem {
  label: string
  present: boolean
}
interface LenderSummaryData {
  empty?: boolean
  header?: LenderHeader
  airworthiness?: AirworthinessSection
  title?: TitleSection
  maintenance_summary?: MaintenanceSection
  incident_history?: IncidentSection
  documents_on_file?: DocumentsChecklistItem[]
  citations?: IntelligenceCitation[]
}
export interface LenderSummaryReport {
  module: 'lender-summary'
  aircraft_id: string
  generated_at: string
  data: LenderSummaryData
  cached: boolean
  quality_score?: IntelligenceQualityScore
}

const PROGRESS_STEPS = [
  'Compiling aircraft identity…',
  'Checking airworthiness status…',
  'Reviewing title & 337 records…',
  'Summarizing maintenance history…',
  'Assembling the summary package…',
]

/** Format an ISO timestamp as a plain calendar date. */
function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function LenderSummaryClient({
  aircraftId,
  initialReport,
}: {
  aircraftId: string
  initialReport: LenderSummaryReport | null
}) {
  const [report, setReport] = useState<LenderSummaryReport | null>(initialReport)
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
      const res = await fetch('/api/intelligence/lender-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aircraft_id: aircraftId, regenerate }),
      })
      if (!res.ok) throw new Error('request failed')
      const json = (await res.json()) as LenderSummaryReport
      setReport(json)
    } catch {
      toast.error('Could not generate the summary. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /** Build a plain-text version of the whole summary and copy it. */
  async function copySummaryText() {
    const d = report?.data
    if (!d || d.empty) return
    const h = d.header
    const aw = d.airworthiness
    const t = d.title
    const m = d.maintenance_summary
    const inc = d.incident_history
    const lines: string[] = []

    lines.push('LENDER / INSURANCE SUMMARY')
    lines.push('='.repeat(40))
    lines.push('')
    lines.push(`Registration:   ${h?.tail_number || '—'}`)
    lines.push(
      `Aircraft:       ${[h?.year, h?.make, h?.model].filter(Boolean).join(' ') || '—'}`,
    )
    lines.push(`Serial Number:  ${h?.serial_number || '—'}`)
    lines.push(`Prepared By:    ${h?.prepared_by || '—'}`)
    lines.push(`Generated:      ${formatDate(h?.generated_date)}`)
    lines.push('')

    lines.push('AIRWORTHINESS')
    lines.push('-'.repeat(40))
    lines.push(`Status: ${aw?.status ?? '—'}`)
    lines.push(
      `Annual Inspection: ${
        aw?.annual_current === true
          ? 'Current'
          : aw?.annual_current === false
            ? 'Not current'
            : 'Undetermined'
      }${aw?.annual_expiration ? ` (expires ${aw.annual_expiration})` : ''}`,
    )
    if (aw?.annual_note) lines.push(aw.annual_note)
    lines.push(
      `Open ADs: ${aw?.open_ad_count != null ? aw.open_ad_count : 'see note'} — ${aw?.open_ad_note ?? ''}`,
    )
    lines.push(`Open Squawks: ${aw?.open_squawk_count ?? 0}`)
    lines.push('')

    lines.push('TITLE & RECORDS')
    lines.push('-'.repeat(40))
    if (t?.text) lines.push(t.text)
    lines.push(`Form 337 records on file: ${t?.form_337_count ?? 0}`)
    if (t?.lien_note) lines.push(t.lien_note)
    lines.push('')

    lines.push('MAINTENANCE SUMMARY')
    lines.push('-'.repeat(40))
    if (m?.years_of_records != null) {
      lines.push(`Years of records on file: ${m.years_of_records}`)
    }
    if (m?.text) lines.push(m.text)
    lines.push('')

    lines.push('INCIDENT HISTORY')
    lines.push('-'.repeat(40))
    if (inc?.text) lines.push(inc.text)
    if (inc?.note) lines.push(inc.note)
    lines.push('')

    lines.push('DOCUMENTS ON FILE')
    lines.push('-'.repeat(40))
    for (const item of d.documents_on_file ?? []) {
      lines.push(`[${item.present ? 'X' : ' '}] ${item.label}`)
    }
    lines.push('')

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success('Summary copied to clipboard')
    } catch {
      toast.error('Could not copy the summary text.')
    }
  }

  const data = report?.data
  const hasReport = Boolean(report) && !data?.empty

  return (
    <div className="p-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          main { overflow: visible !important; }
          .print-card {
            break-inside: avoid;
            box-shadow: none !important;
            border-color: #d4d4d8 !important;
          }
          .print-doc { max-width: 100% !important; }
          @page { margin: 0.6in; }
        }
      `}</style>

      <div className="print-doc max-w-3xl mx-auto">
        {/* Page header / actions */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Landmark className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Lender / Insurance Summary
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {hasReport && report
                  ? `Generated ${formatDate(report.generated_at)}${report.cached ? ' · cached' : ''}`
                  : 'A clean summary package for lenders and insurance underwriters.'}
              </p>
            </div>
          </div>
          {hasReport && (
            <div className="flex items-center gap-2 no-print">
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Export as PDF
              </Button>
              <Button size="sm" variant="outline" onClick={copySummaryText}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy Summary Text
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
              Building the summary package from this aircraft&apos;s records and existing
              analyses — this only takes a moment.
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
              The Lender / Insurance Summary is built from this aircraft&apos;s uploaded
              logbooks and records. Upload documents to generate the package.
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
              <Landmark className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-foreground" style={{ fontWeight: 600 }}>
                Generate the Lender / Insurance Summary
              </p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                We&apos;ll assemble the one-page package lenders and underwriters ask for —
                identity, airworthiness, title, maintenance, incidents, and records.
              </p>
            </div>
            <Button onClick={() => generate(false)}>
              <Landmark className="h-4 w-4 mr-1.5" />
              Generate Summary
            </Button>
          </div>
        )}

        {/* Report — the print artifact */}
        {!loading && hasReport && data && (
          <>
            <QualityBadge score={report?.quality_score} />
            <div className="rounded-xl border border-border bg-white print-card">
              <HeaderBlock header={data.header} />
            <div className="px-6 pb-6 space-y-5">
              <AirworthinessBlock section={data.airworthiness} />
              <TitleBlock section={data.title} />
              <MaintenanceBlock section={data.maintenance_summary} />
              <IncidentBlock section={data.incident_history} />
              <DocumentsBlock items={data.documents_on_file} />
              {data.citations && data.citations.length > 0 && (
                <div className="pt-1">
                  <SectionLabel icon={ScrollText} title="Sources" />
                  <CitationChips citations={data.citations} />
                </div>
              )}
              <p className="text-[10.5px] italic text-muted-foreground border-t border-border pt-3">
                This summary is generated from documents uploaded to MyAircraft and is
                provided for informational purposes only. It does not constitute a title
                search, an airworthiness determination, or a substitute for physical
                inspection or official FAA / NTSB records.
              </p>
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// --- Report building blocks ------------------------------------------------

function SectionLabel({ icon: Icon, title }: { icon: typeof Plane; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2
        className="text-[12px] uppercase tracking-wide text-foreground"
        style={{ fontWeight: 700 }}
      >
        {title}
      </h2>
    </div>
  )
}

/** Narrative paragraph with an "insufficient records" fallback. */
function Narrative({ text }: { text: string | undefined }) {
  if (!text || !text.trim()) {
    return (
      <p className="text-[12.5px] italic text-muted-foreground">
        Insufficient records to summarize this section.
      </p>
    )
  }
  return (
    <p className="text-[12.5px] text-foreground/90 leading-relaxed whitespace-pre-wrap">{text}</p>
  )
}

function HeaderBlock({ header }: { header: LenderHeader | undefined }) {
  const rows: Array<[string, string]> = [
    ['Registration', header?.tail_number || '—'],
    ['Year', header?.year != null ? String(header.year) : '—'],
    ['Make / Model', [header?.make, header?.model].filter(Boolean).join(' ') || '—'],
    ['Serial Number', header?.serial_number || '—'],
    ['Prepared By', header?.prepared_by || '—'],
    ['Date Prepared', formatDate(header?.generated_date)],
  ]
  return (
    <div className="border-b border-border bg-muted/20 px-6 py-5 rounded-t-xl">
      <div className="flex items-center gap-2 mb-3">
        <Plane className="h-5 w-5 text-primary" />
        <div>
          <div
            className="text-[15px] text-foreground tracking-tight"
            style={{ fontWeight: 700 }}
          >
            Aircraft Summary Package
          </div>
          <div className="text-[11px] text-muted-foreground">
            Prepared for lender / insurance underwriting review
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2.5">
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
    </div>
  )
}

function AirworthinessBlock({ section }: { section: AirworthinessSection | undefined }) {
  const airworthy = section?.status === 'AIRWORTHY'
  return (
    <section>
      <SectionLabel icon={ShieldCheck} title="Airworthiness" />
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className={
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ' +
            (airworthy
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700')
          }
          style={{ fontWeight: 700 }}
        >
          {airworthy ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {section?.status ?? '—'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2.5">
        <Stat
          label="Annual Inspection"
          value={
            section?.annual_current === true
              ? 'Current'
              : section?.annual_current === false
                ? 'Not current'
                : 'Undetermined'
          }
          sub={section?.annual_expiration ? `Expires ${section.annual_expiration}` : undefined}
          tone={
            section?.annual_current === true
              ? 'good'
              : section?.annual_current === false
                ? 'bad'
                : 'neutral'
          }
        />
        <Stat
          label="Open ADs"
          value={
            section?.open_ad_count != null ? String(section.open_ad_count) : 'See note'
          }
          tone={section?.open_ad_count ? 'bad' : 'good'}
        />
        <Stat
          label="Open Squawks"
          value={String(section?.open_squawk_count ?? 0)}
          tone={section?.open_squawk_count ? 'bad' : 'good'}
        />
      </div>
      <Narrative text={section?.annual_note} />
      {section?.open_ad_note && (
        <p className="mt-1.5 text-[12px] text-foreground/80">{section.open_ad_note}</p>
      )}
    </section>
  )
}

function TitleBlock({ section }: { section: TitleSection | undefined }) {
  return (
    <section>
      <SectionLabel icon={ScrollText} title="Title & Records" />
      <Narrative text={section?.text} />
      <div className="mt-2">
        <Stat
          label="Form 337 Records on File"
          value={section?.form_337_count != null ? String(section.form_337_count) : '0'}
          tone="neutral"
        />
      </div>
      <p className="mt-2 text-[11px] italic text-amber-700">
        {section?.lien_note ??
          'Lien search not performed — verify with the FAA Aircraft Registry.'}
      </p>
    </section>
  )
}

function MaintenanceBlock({ section }: { section: MaintenanceSection | undefined }) {
  return (
    <section>
      <SectionLabel icon={Wrench} title="Maintenance Summary" />
      {section?.years_of_records != null && (
        <div className="mb-2">
          <Stat
            label="Years of Records on File"
            value={String(section.years_of_records)}
            tone="neutral"
          />
        </div>
      )}
      <Narrative text={section?.text} />
    </section>
  )
}

function IncidentBlock({ section }: { section: IncidentSection | undefined }) {
  const damage = section?.damage_found === true
  return (
    <section>
      <SectionLabel icon={AlertTriangle} title="Incident History" />
      <div
        className={
          'rounded-lg border px-3 py-2.5 ' +
          (damage
            ? 'border-amber-200 bg-amber-50'
            : 'border-emerald-200 bg-emerald-50')
        }
      >
        <p
          className={
            'text-[12.5px] leading-relaxed whitespace-pre-wrap ' +
            (damage ? 'text-amber-800' : 'text-emerald-800')
          }
        >
          {section?.text || 'No damage history found in uploaded records.'}
        </p>
      </div>
      <p className="mt-2 text-[11px] italic text-muted-foreground">
        {section?.note ??
          'Does not substitute for an official NTSB / FAA accident record search.'}
      </p>
    </section>
  )
}

function DocumentsBlock({ items }: { items: DocumentsChecklistItem[] | undefined }) {
  const list = items ?? []
  return (
    <section>
      <SectionLabel icon={FileCheck2} title="Documents on File" />
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
        {list.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            {item.present ? (
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <X className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <span
              className={
                'text-[12.5px] ' +
                (item.present ? 'text-foreground' : 'text-muted-foreground')
              }
              style={{ fontWeight: item.present ? 600 : 400 }}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Compact labeled stat with a good/bad/neutral tone. */
function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: 'good' | 'bad' | 'neutral'
}) {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'bad'
        ? 'text-amber-700'
        : 'text-foreground'
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
      <div
        className="text-[10px] uppercase tracking-wide text-muted-foreground"
        style={{ fontWeight: 600 }}
      >
        {label}
      </div>
      <div className={`text-[13px] tabular-nums ${valueColor}`} style={{ fontWeight: 700 }}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
