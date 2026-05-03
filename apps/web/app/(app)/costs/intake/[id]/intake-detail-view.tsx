'use client'

/**
 * IntakeDetailView (Spec 7.3) — operator review of one extracted intake.
 *
 * Layout: two columns at lg+, stacked on mobile.
 *   - Left: native browser PDF/image preview from a 10-min signed URL.
 *   - Right: parsed fields (vendor, totals, line items, tail match) with
 *     confidence badges; original raw_text in a collapsible card; sticky
 *     footer with Approve / Reject when the intake is in 'review' /
 *     'extracted'. Re-run extraction on stuck/failed rows.
 *
 * All write actions hit /api/costs/intake/[id] (PATCH approve|reject|
 * edit_status) or /api/costs/intake/[id]/extract (POST manual run).
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, CheckCircle2, X, RotateCw, Loader2, Sparkles, FileText, ImageIcon, Mail,
  AlertTriangle, ExternalLink, Plane,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CostEntry, ExtractionResult, IntakeDocument, IntakeStatus } from '@/types'

interface Props {
  intake: IntakeDocument
  extraction: ExtractionResult | null
  costEntries: CostEntry[]
  previewUrl: string | null
  canWrite: boolean
}

const STATUS_TONE: Record<IntakeStatus, string> = {
  received:   'bg-blue-50 text-blue-700 border-blue-200',
  extracting: 'bg-amber-50 text-amber-700 border-amber-200',
  extracted:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  review:     'bg-amber-50 text-amber-700 border-amber-200',
  posted:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:   'bg-rose-50 text-rose-700 border-rose-200',
}

interface ParsedFields {
  doc_kind?: string
  vendor?: string | null
  vendor_address?: string | null
  carrier?: string | null
  invoice_number?: string | null
  policy_number?: string | null
  date?: string | null
  total_amount?: number | null
  labor_total?: number | null
  parts_total?: number | null
  tax_amount?: number | null
  annual_premium?: number | null
  hull_value?: number | null
  liability_limit?: number | null
  policy_period_start?: string | null
  policy_period_end?: string | null
  insured_name?: string | null
  currency?: string | null
  tail_number?: string | null
  service_type?: string | null
  line_items?: Array<{
    description: string
    amount: number
    quantity?: number | null
    unit_price?: number | null
    category_hint?: string | null
  }>
  notes?: string | null
}

function fmtMoney(amt: number | null | undefined, currency: string = 'USD') {
  if (amt == null || !Number.isFinite(amt)) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2 }).format(amt)
}

function ConfidencePill({ value }: { value: number | null | undefined }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  const tone =
    pct >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    pct >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' :
    'bg-rose-50 text-rose-700 border-rose-200'
  return (
    <span
      className={cn('inline-flex items-center text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border tabular-nums', tone)}
      style={{ fontWeight: 700 }}
      title="Model self-reported extraction confidence"
    >
      {pct}%
    </span>
  )
}

function FieldRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-b border-border last:border-b-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div className={cn('text-[12.5px] text-foreground', mono && 'font-mono')} style={{ fontWeight: 500 }}>
        {value || <span className="text-muted-foreground/60">—</span>}
      </div>
    </div>
  )
}

export function IntakeDetailView({ intake, extraction, costEntries, previewUrl, canWrite }: Props) {
  const router = useRouter()
  const [working, setWorking] = useState<'approve' | 'reject' | 'extract' | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const parsed = (extraction?.parsed_fields ?? {}) as ParsedFields
  const currency = parsed.currency ?? 'USD'
  const isImage = (intake.mime_type ?? '').startsWith('image/')
  const isPdf = intake.mime_type === 'application/pdf'

  const totals = useMemo(() => {
    const sum = (parsed.line_items ?? []).reduce((a, x) => a + (Number.isFinite(x.amount) ? x.amount : 0), 0)
    return { lineSum: sum, declaredTotal: parsed.total_amount ?? null }
  }, [parsed])

  const sumMismatch =
    totals.declaredTotal != null && totals.lineSum > 0 &&
    Math.abs(totals.lineSum - totals.declaredTotal) > 1

  async function callPatch(action: 'approve' | 'reject') {
    setWorking(action)
    try {
      const res = await fetch(`/api/costs/intake/${intake.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      toast.success(action === 'approve'
        ? `Posted — ${data.cost_entries_approved ?? 0} cost line${(data.cost_entries_approved ?? 0) === 1 ? '' : 's'} approved`
        : 'Rejected')
      if (action === 'approve') router.push('/costs')
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setWorking(null)
    }
  }

  async function rerun() {
    setWorking('extract')
    try {
      const res = await fetch(`/api/costs/intake/${intake.id}/extract`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      toast.success('Extraction complete')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setWorking(null)
    }
  }

  const showApproveReject = canWrite && (intake.status === 'review' || intake.status === 'extracted')
  const showRerun = canWrite && (intake.status === 'received' || intake.status === 'extracting' || intake.status === 'review')

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/costs/intake" className="mt-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[18px] tracking-tight text-foreground truncate" style={{ fontWeight: 700 }}>
              {parsed.vendor || parsed.carrier || intake.email_subject || intake.filename}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn(
                'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
                STATUS_TONE[intake.status],
              )} style={{ fontWeight: 700 }}>
                {intake.status === 'rejected' && <X className="h-2.5 w-2.5 mr-0.5" />}
                {intake.status === 'posted' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                {intake.status === 'extracting' && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
                {intake.status === 'extracted' && <Sparkles className="h-2.5 w-2.5 mr-0.5" />}
                {intake.status}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {intake.source === 'email' ? <Mail className="inline h-3 w-3 mr-1 text-amber-700" /> : null}
                {intake.source} · {intake.filename}
                {intake.file_size_bytes ? ` · ${(intake.file_size_bytes / 1024).toFixed(0)} KB` : ''}
              </span>
              {extraction?.model_used && (
                <span className="text-[10.5px] text-muted-foreground/80 font-mono">
                  {extraction.model_used} · {extraction.duration_ms ?? '—'}ms · {extraction.input_tokens ?? 0}↓/{extraction.output_tokens ?? 0}↑
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Body — two columns */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 grid lg:grid-cols-2 gap-6">

          {/* LEFT: original document preview */}
          <div className="rounded-2xl border border-border bg-white overflow-hidden flex flex-col" style={{ minHeight: 600 }}>
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                Original document
              </div>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                  style={{ fontWeight: 600 }}
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="flex-1 bg-slate-50 flex items-center justify-center overflow-hidden">
              {!previewUrl ? (
                <div className="text-center text-muted-foreground text-[12px] p-8">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  No file attached
                </div>
              ) : isPdf ? (
                <iframe
                  src={previewUrl}
                  title="Receipt PDF"
                  className="w-full h-full min-h-[600px] border-0 bg-white"
                />
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt={intake.filename} className="max-w-full max-h-[800px] object-contain" />
              ) : (
                <div className="text-center text-muted-foreground text-[12px] p-8">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  Preview not available — <a className="text-primary underline" href={previewUrl} target="_blank" rel="noopener noreferrer">open file</a>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: parsed fields */}
          <div className="space-y-4">

            {/* Extraction summary card */}
            <div className="rounded-2xl border border-border bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                    {parsed.doc_kind === 'maintenance-invoice' ? 'Maintenance invoice' :
                     parsed.doc_kind === 'insurance-declaration' ? 'Insurance declaration' :
                     parsed.doc_kind === 'cost-receipt' ? 'Cost receipt' :
                     extraction ? 'Extraction' : 'Awaiting extraction'}
                  </h2>
                </div>
                {extraction && <ConfidencePill value={extraction.extraction_confidence} />}
              </div>

              {!extraction ? (
                <div className="text-[12px] text-muted-foreground py-6 text-center">
                  Document hasn&apos;t been extracted yet.
                  {showRerun && (
                    <div className="mt-3">
                      <Button size="sm" onClick={() => void rerun()} disabled={working !== null}>
                        {working === 'extract' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1" />}
                        Run extraction
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {extraction.status === 'manual_review_needed' && (
                    <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-[11.5px] text-rose-800 flex gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Manual review needed.</strong> {extraction.error_message ?? 'Schema validation failed twice.'}
                      </div>
                    </div>
                  )}
                  {sumMismatch && (
                    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11.5px] text-amber-800 flex gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        Line items sum to {fmtMoney(totals.lineSum, currency)} but the declared total is {fmtMoney(totals.declaredTotal, currency)}.
                      </div>
                    </div>
                  )}

                  <div className="space-y-0">
                    {parsed.doc_kind === 'insurance-declaration' ? (
                      <>
                        <FieldRow label="Carrier" value={parsed.carrier} />
                        <FieldRow label="Policy #" value={parsed.policy_number} mono />
                        <FieldRow label="Insured" value={parsed.insured_name} />
                        <FieldRow label="Annual premium" value={fmtMoney(parsed.annual_premium, currency)} />
                        <FieldRow label="Hull value" value={fmtMoney(parsed.hull_value, currency)} />
                        <FieldRow label="Liability limit" value={fmtMoney(parsed.liability_limit, currency)} />
                        <FieldRow label="Policy period" value={
                          parsed.policy_period_start || parsed.policy_period_end
                            ? `${parsed.policy_period_start ?? '?'} → ${parsed.policy_period_end ?? '?'}`
                            : null
                        } />
                      </>
                    ) : parsed.doc_kind === 'maintenance-invoice' ? (
                      <>
                        <FieldRow label="Vendor" value={parsed.vendor} />
                        <FieldRow label="Invoice #" value={parsed.invoice_number} mono />
                        <FieldRow label="Date" value={parsed.date} />
                        <FieldRow label="Service type" value={parsed.service_type ?? null} />
                        <FieldRow label="Labor" value={fmtMoney(parsed.labor_total, currency)} />
                        <FieldRow label="Parts" value={fmtMoney(parsed.parts_total, currency)} />
                        <FieldRow label="Tax" value={fmtMoney(parsed.tax_amount, currency)} />
                        <FieldRow label="Total" value={<strong>{fmtMoney(parsed.total_amount, currency)}</strong>} />
                      </>
                    ) : (
                      <>
                        <FieldRow label="Vendor" value={parsed.vendor} />
                        <FieldRow label="Date" value={parsed.date} />
                        <FieldRow label="Total" value={<strong>{fmtMoney(parsed.total_amount, currency)}</strong>} />
                      </>
                    )}

                    <FieldRow
                      label="Aircraft"
                      value={
                        parsed.tail_number ? (
                          <span className="inline-flex items-center gap-2">
                            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono">{parsed.tail_number}</span>
                            <ConfidencePill value={extraction.aircraft_match_confidence} />
                            {extraction.aircraft_match_confidence < 0.85 && (
                              <span className="text-[10.5px] text-amber-700">no match in fleet</span>
                            )}
                          </span>
                        ) : null
                      }
                    />
                  </div>
                </>
              )}
            </div>

            {/* Line items */}
            {parsed.line_items && parsed.line_items.length > 0 && (
              <div className="rounded-2xl border border-border bg-white overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                    Line items ({parsed.line_items.length})
                  </div>
                  <div className="text-[11px] tabular-nums text-muted-foreground">
                    Sum {fmtMoney(totals.lineSum, currency)}
                  </div>
                </div>
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/15 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Description</th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Qty</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsed.line_items.map((li, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5">
                          <div className="text-foreground" style={{ fontWeight: 500 }}>{li.description}</div>
                          {li.category_hint && (
                            <div className="text-[10px] text-muted-foreground capitalize">{li.category_hint.replace(/_/g, ' ')}</div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{li.quantity ?? '—'}</td>
                        <td className="px-3 py-1.5 tabular-nums text-right">{fmtMoney(li.amount, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Resulting cost entries */}
            {costEntries.length > 0 && (
              <div className="rounded-2xl border border-border bg-white overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-muted/30">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                    Cost entries ({costEntries.length}) — {costEntries.every((c) => c.approved) ? 'approved' : 'pending review'}
                  </div>
                </div>
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/15 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Date</th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Category</th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Bucket</th>
                      <th className="text-right px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {costEntries.map((ce) => (
                      <tr key={ce.id}>
                        <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{ce.cost_date}</td>
                        <td className="px-3 py-1.5 capitalize">{ce.category.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-1.5 text-muted-foreground capitalize">{ce.bucket.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-1.5 tabular-nums text-right">{fmtMoney(ce.amount, ce.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Raw model output (debug) */}
            {extraction?.raw_text && (
              <div className="rounded-2xl border border-border bg-white">
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="w-full px-4 py-2 text-left text-[11px] uppercase tracking-wider text-muted-foreground hover:bg-muted/30"
                  style={{ fontWeight: 700 }}
                >
                  {showRaw ? '▼' : '▶'} Raw model output
                </button>
                {showRaw && (
                  <pre className="px-4 py-3 text-[11px] font-mono whitespace-pre-wrap text-muted-foreground/90 max-h-72 overflow-auto border-t border-border bg-muted/10">
                    {extraction.raw_text}
                  </pre>
                )}
              </div>
            )}

            {intake.error_message && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{intake.error_message}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky footer — actions */}
      {(showApproveReject || showRerun) && (
        <div className="border-t border-border bg-white px-6 py-3 shrink-0 flex items-center justify-end gap-2">
          {showRerun && (
            <Button variant="outline" size="sm" onClick={() => void rerun()} disabled={working !== null}>
              {working === 'extract' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1" />}
              Re-run extraction
            </Button>
          )}
          {showApproveReject && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void callPatch('reject')}
                disabled={working !== null}
                className="text-rose-700 hover:bg-rose-50"
              >
                {working === 'reject' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1" />}
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => void callPatch('approve')}
                disabled={working !== null}
              >
                {working === 'approve' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Approve & post
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
