'use client'

import { useState } from 'react'
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  SkipForward,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Clock,
  Zap,
  GitMerge,
  ShieldAlert,
  ShieldCheck,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${Math.round(n * 100)}%`
}

function confidenceBand(n: number | null | undefined): 'high' | 'medium' | 'low' | 'critical' {
  if (n == null) return 'low'
  if (n >= 0.9) return 'high'
  if (n >= 0.7) return 'medium'
  if (n >= 0.5) return 'low'
  return 'critical'
}

const BAND_COLOR: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-400',
  low: 'bg-orange-500',
  critical: 'bg-red-600',
}

const BAND_TEXT: Record<string, string> = {
  high: 'text-green-700',
  medium: 'text-amber-700',
  low: 'text-orange-700',
  critical: 'text-red-700',
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  auto_accept: { label: 'Auto-Accept', cls: 'bg-green-100 text-green-800 border-green-200' },
  accept_with_caution: { label: 'Accept w/ Caution', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  review_required: { label: 'Review Required', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  reject: { label: 'Reject', cls: 'bg-red-100 text-red-800 border-red-200' },
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
}

function formatClassification(raw: string | null | undefined) {
  if (!raw) return 'Unknown'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Per-field comparison table ───────────────────────────────────────────────

function FieldComparisonTable({
  candidates,
  conflicts,
  fieldName,
}: {
  candidates: any[]
  conflicts: any[]
  fieldName: string
}) {
  const fieldCandidates = candidates.filter((c) => c.field_name === fieldName)
  const fieldConflict = conflicts.find((c) => c.field_name === fieldName)

  if (fieldCandidates.length === 0) return null

  return (
    <div className={cn(
      'rounded-md border text-xs overflow-hidden',
      fieldConflict ? 'border-orange-300 bg-orange-50' : 'border-border'
    )}>
      {fieldConflict && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-100 border-b border-orange-200">
          <GitMerge className="w-3 h-3 text-orange-600 flex-shrink-0" />
          <span className="text-orange-700 font-medium">
            Conflict ({fieldConflict.severity}) — {fieldConflict.conflict_reason?.replace(/_/g, ' ')}
          </span>
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Engine</th>
            <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Value</th>
            <th className="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Conf.</th>
            <th className="text-right px-2.5 py-1.5 font-medium text-muted-foreground">Valid.</th>
          </tr>
        </thead>
        <tbody>
          {fieldCandidates.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="px-2.5 py-1.5 font-mono text-muted-foreground">
                {c.source_engine?.replace(/_/g, ' ')}
              </td>
              <td className="px-2.5 py-1.5 font-medium max-w-[200px] truncate">
                {c.candidate_value ?? <span className="italic text-muted-foreground">empty</span>}
              </td>
              <td className={cn('px-2.5 py-1.5 text-right font-semibold', BAND_TEXT[confidenceBand(c.raw_confidence)])}>
                {pct(c.raw_confidence)}
              </td>
              <td className="px-2.5 py-1.5 text-right">
                {c.validation_status === 'valid' ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-green-600 inline" />
                ) : c.validation_status === 'suspicious' ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 inline" />
                ) : c.validation_status === 'invalid' ? (
                  <XCircle className="w-3.5 h-3.5 text-red-500 inline" />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Editable fields ──────────────────────────────────────────────────────────

interface EditedFields {
  event_type: string
  event_date: string
  tach_time: string
  work_description: string
  mechanic_name: string
  mechanic_cert_number: string
  ad_references: string
}

function fieldInputCls() {
  return 'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2'
}

// ─── Queue Item Card ──────────────────────────────────────────────────────────

function QueueItemCard({
  item,
  onAction,
  loading,
}: {
  item: any
  onAction: (id: string, action: string, fields: EditedFields, pageId?: string, extractedEventId?: string) => void
  loading: boolean
}) {
  const job = item.ocr_page_job ?? {}
  const event = item.ocr_extracted_event ?? {}
  const reasoning = job.arbitration_reasoning ?? {}
  const fieldResults = reasoning.field_results ?? {}
  const warnings: string[] = reasoning.validator_warnings ?? []
  const fieldCandidates: any[] = item.fieldCandidates ?? []
  const fieldConflicts: any[] = item.fieldConflicts ?? []
  const arbStatus: string = job.arbitration_status ?? 'pending'
  const arbConf: number | null = job.arbitration_confidence ?? job.ocr_confidence ?? null

  const [expanded, setExpanded] = useState(true)
  const [showRaw, setShowRaw] = useState(false)

  // Proposed values from arbitration (fall back to extracted event)
  function proposedFor(fieldName: string, fallback: string) {
    return fieldResults[fieldName]?.proposed ?? fallback
  }

  const [fields, setFields] = useState<EditedFields>({
    event_type: proposedFor('event_type', event.event_type ?? 'maintenance'),
    event_date: proposedFor('entry_date', event.event_date ?? ''),
    tach_time: proposedFor('tach_time', event.tach_time?.toString() ?? ''),
    work_description: proposedFor('work_description', event.work_description ?? job.ocr_raw_text ?? ''),
    mechanic_name: proposedFor('mechanic_name', event.mechanic_name ?? ''),
    mechanic_cert_number: proposedFor('mechanic_cert_number', event.mechanic_cert_number ?? ''),
    ad_references: proposedFor('ad_reference',
      Array.isArray(event.ad_references) ? event.ad_references.join(', ') : event.ad_references ?? ''
    ),
  })

  function update(key: keyof EditedFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const docTitle = job.document?.title ?? 'Unknown Document'
  const pageNumber = job.page_number ?? '?'
  const band = confidenceBand(arbConf)
  const statusMeta = STATUS_BADGE[arbStatus] ?? STATUS_BADGE.pending
  const conflictCount = fieldConflicts.length
  const hasEngines = Array.isArray(job.engines_run) && job.engines_run.length > 0
  const detectedType = reasoning.detected_inspection_type

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: doc + page + tags */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge variant="secondary" className="shrink-0">
              <FileText className="w-3 h-3 mr-1" />
              {docTitle}
            </Badge>
            <Badge variant="outline" className="shrink-0">
              Page {pageNumber}
            </Badge>
            {job.page_classification && (
              <Badge className="shrink-0 bg-blue-50 text-blue-800 border-blue-200">
                {formatClassification(job.page_classification)}
              </Badge>
            )}
            {detectedType && (
              <Badge className="shrink-0 bg-purple-50 text-purple-800 border-purple-200">
                {detectedType.toUpperCase()}
              </Badge>
            )}
            <Badge className={cn('shrink-0 border', statusMeta.cls)}>
              {statusMeta.label}
            </Badge>
            {conflictCount > 0 && (
              <Badge className="shrink-0 bg-orange-100 text-orange-800 border-orange-200">
                <GitMerge className="w-3 h-3 mr-1" />
                {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
              </Badge>
            )}
            {item.review_reason && (
              <Badge className="shrink-0 bg-amber-50 text-amber-800 border-amber-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {item.review_reason}
              </Badge>
            )}
          </div>

          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Confidence bar */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground font-medium">
              <Zap className="w-3 h-3" />
              Arbitration Confidence
              {hasEngines && (
                <span className="text-muted-foreground font-normal">
                  ({job.engines_run.length} engine{job.engines_run.length > 1 ? 's' : ''}: {job.engines_run.join(', ')})
                </span>
              )}
            </div>
            <span className={cn('font-bold', BAND_TEXT[band])}>
              {pct(arbConf)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', BAND_COLOR[band])}
              style={{ width: pct(arbConf) }}
            />
          </div>
        </div>

        {/* Validator warnings */}
        {warnings.length > 0 && (
          <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 space-y-0.5">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Validation Warnings
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 pl-5">{w}</p>
            ))}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* ── LEFT: raw text + multi-engine candidates ─────────────────── */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Raw OCR Text
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showRaw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showRaw && (
                  <div
                    className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-y-auto border"
                    style={{ maxHeight: 180 }}
                  >
                    {job.ocr_raw_text ? (
                      <pre className="whitespace-pre-wrap break-words">{job.ocr_raw_text}</pre>
                    ) : (
                      <span className="text-muted-foreground italic">No raw text captured</span>
                    )}
                  </div>
                )}
              </div>

              {/* Multi-engine field candidates */}
              {fieldCandidates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <GitMerge className="w-3 h-3" /> Engine Comparison
                  </p>
                  {['entry_date', 'tach_time', 'mechanic_name', 'ad_reference', 'mechanic_cert_number'].map((f) => {
                    const hasCandidates = fieldCandidates.some((c) => c.field_name === f)
                    if (!hasCandidates) return null
                    return (
                      <div key={f}>
                        <p className="text-xs font-medium text-foreground mb-1">
                          {f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </p>
                        <FieldComparisonTable
                          candidates={fieldCandidates}
                          conflicts={fieldConflicts}
                          fieldName={f}
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Queued {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* ── RIGHT: editable canonical fields ─────────────────────────── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                Proposed Canonical Values
              </p>

              {/* Entry type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Entry Type</label>
                <select
                  value={fields.event_type}
                  onChange={(e) => update('event_type', e.target.value)}
                  className={fieldInputCls()}
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="annual">Annual Inspection</option>
                  <option value="100hr">100-Hour Inspection</option>
                  <option value="oil_change">Oil Change</option>
                  <option value="repair">Repair</option>
                  <option value="ad_compliance">AD Compliance</option>
                  <option value="overhaul">Overhaul</option>
                  <option value="return_to_service">Return to Service</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Date */}
              <div>
                <label className={cn(
                  'block text-xs font-medium mb-1',
                  fieldResults['entry_date']?.validationStatus === 'invalid' ? 'text-red-600' :
                  fieldResults['entry_date']?.validationStatus === 'suspicious' ? 'text-amber-600' :
                  'text-muted-foreground'
                )}>
                  Date
                  {fieldResults['entry_date']?.validationNotes && (
                    <span className="ml-1.5 font-normal">({fieldResults['entry_date'].validationNotes})</span>
                  )}
                </label>
                <input
                  type="date"
                  value={fields.event_date}
                  onChange={(e) => update('event_date', e.target.value)}
                  className={fieldInputCls()}
                />
              </div>

              {/* Tach / TT */}
              <div>
                <label className={cn(
                  'block text-xs font-medium mb-1',
                  fieldResults['tach_time']?.validationStatus === 'invalid' ? 'text-red-600' :
                  fieldResults['tach_time']?.validationStatus === 'suspicious' ? 'text-amber-600' :
                  'text-muted-foreground'
                )}>
                  Tach / TT (hours)
                  {fieldResults['tach_time']?.validationNotes && (
                    <span className="ml-1.5 font-normal">({fieldResults['tach_time'].validationNotes})</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={fields.tach_time}
                  onChange={(e) => update('tach_time', e.target.value)}
                  placeholder="e.g. 1234.5"
                  className={fieldInputCls()}
                />
              </div>

              {/* Work description */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Work Description</label>
                <textarea
                  value={fields.work_description}
                  onChange={(e) => update('work_description', e.target.value)}
                  rows={4}
                  className={cn(fieldInputCls(), 'resize-none')}
                />
              </div>

              {/* Mechanic */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Mechanic Name</label>
                  <input
                    type="text"
                    value={fields.mechanic_name}
                    onChange={(e) => update('mechanic_name', e.target.value)}
                    placeholder="John Smith"
                    className={fieldInputCls()}
                  />
                </div>
                <div>
                  <label className={cn(
                    'block text-xs font-medium mb-1',
                    fieldResults['mechanic_cert_number']?.validationStatus === 'suspicious' ? 'text-amber-600' : 'text-muted-foreground'
                  )}>
                    A&amp;P / IA Cert #
                  </label>
                  <input
                    type="text"
                    value={fields.mechanic_cert_number}
                    onChange={(e) => update('mechanic_cert_number', e.target.value)}
                    placeholder="1234567"
                    className={fieldInputCls()}
                  />
                </div>
              </div>

              {/* AD References */}
              <div>
                <label className={cn(
                  'block text-xs font-medium mb-1',
                  fieldResults['ad_reference']?.validationStatus === 'suspicious' ? 'text-amber-600' : 'text-muted-foreground'
                )}>
                  AD References
                  {fieldResults['ad_reference']?.validationNotes && (
                    <span className="ml-1.5 font-normal text-amber-600">({fieldResults['ad_reference'].validationNotes})</span>
                  )}
                </label>
                <input
                  type="text"
                  value={fields.ad_references}
                  onChange={(e) => update('ad_references', e.target.value)}
                  placeholder="e.g. 2023-14-05, 2021-08-10"
                  className={fieldInputCls()}
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'approve', fields, job.id, event.id)}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  Approve &amp; Canonicalize
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'reject', fields, job.id, event.id)}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Reject
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-muted-foreground"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'unreadable', fields, job.id, event.id)}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                  Unreadable
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'skip', fields, job.id, event.id)}
                >
                  <SkipForward className="w-3.5 h-3.5 mr-1.5" />
                  Skip
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterType = 'all' | 'conflicts' | 'low_confidence' | 'reject'

export default function ReviewQueueClient({
  items: initialItems,
  orgId,
  totalNeedsReview,
}: {
  items: any[]
  orgId: string
  totalNeedsReview: number
}) {
  const [items, setItems] = useState<any[]>(initialItems)
  const [filter, setFilter] = useState<FilterType>('all')
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const filtered = items.filter((item) => {
    const arbStatus = item.ocr_page_job?.arbitration_status
    const conf = item.ocr_page_job?.arbitration_confidence ?? item.ocr_page_job?.ocr_confidence ?? 1
    const hasConflicts = (item.fieldConflicts ?? []).length > 0
    if (filter === 'conflicts') return hasConflicts
    if (filter === 'low_confidence') return conf < 0.7
    if (filter === 'reject') return arbStatus === 'reject'
    return true
  })

  async function handleAction(
    id: string,
    action: string,
    correctedFields: EditedFields,
    pageId?: string,
    extractedEventId?: string
  ) {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
      if (action === 'approve' && pageId) {
        // Call canonicalize endpoint
        await fetch('/api/ocr/canonicalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page_id: pageId,
            corrected_fields: {
              event_type: correctedFields.event_type,
              event_date: correctedFields.event_date || null,
              tach_time: correctedFields.tach_time || null,
              work_description: correctedFields.work_description,
              mechanic_name: correctedFields.mechanic_name,
              mechanic_cert_number: correctedFields.mechanic_cert_number,
              ad_reference: correctedFields.ad_references,
            },
          }),
        })
      } else {
        // Reject / unreadable / skip — update review queue item
        await fetch('/api/ocr/review', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            action,
            corrected_fields: {
              event_type: correctedFields.event_type,
              event_date: correctedFields.event_date || null,
              tach_time: correctedFields.tach_time ? parseFloat(correctedFields.tach_time) : null,
              work_description: correctedFields.work_description,
              mechanic_name: correctedFields.mechanic_name,
              mechanic_cert_number: correctedFields.mechanic_cert_number,
              ad_references: correctedFields.ad_references
                ? correctedFields.ad_references.split(',').map((s) => s.trim()).filter(Boolean)
                : [],
            },
            extracted_event_id: extractedEventId,
          }),
        })
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      // Silent fail — item stays in queue
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const filterButtons: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'conflicts', label: 'Conflicts', count: items.filter((i) => (i.fieldConflicts ?? []).length > 0).length },
    { key: 'low_confidence', label: 'Low Confidence', count: items.filter((i) => (i.ocr_page_job?.arbitration_confidence ?? 1) < 0.7).length },
    { key: 'reject', label: 'Rejected', count: items.filter((i) => i.ocr_page_job?.arbitration_status === 'reject').length },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">OCR Review Queue</h1>
              <p className="text-sm text-muted-foreground">
                Multi-engine arbitration · Review low-confidence and conflicting extractions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalNeedsReview > items.length && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                {totalNeedsReview - items.length} more in backlog
              </span>
            )}
            <Badge
              variant="secondary"
              className={cn(
                'text-sm px-3 py-1',
                items.length > 0
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-green-100 text-green-800 border-green-200'
              )}
            >
              {items.length} pending
            </Badge>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                filter === btn.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {btn.label}
              {btn.count !== undefined && btn.count > 0 && (
                <span className="ml-1.5 text-xs opacity-75">({btn.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <ClipboardCheck className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {items.length === 0 ? 'Queue is clear!' : 'No items match this filter'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {items.length === 0
                ? 'All extractions have passed arbitration or been reviewed.'
                : 'Try a different filter to see more items.'}
            </p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-4">
          {filtered.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              loading={!!actionLoading[item.id]}
              onAction={handleAction}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
