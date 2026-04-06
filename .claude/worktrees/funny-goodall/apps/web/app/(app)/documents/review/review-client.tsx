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
  Shield,
  Activity,
  AlertCircle,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatClassification(raw: string | null | undefined): string {
  if (!raw) return 'Unknown'
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function confidenceColor(score: number): string {
  if (score < 0.5) return 'bg-red-500'
  if (score < 0.7) return 'bg-amber-500'
  if (score < 0.9) return 'bg-yellow-400'
  return 'bg-green-500'
}

function confidenceLabel(score: number): string {
  if (score < 0.5) return 'text-red-600'
  if (score < 0.7) return 'text-amber-600'
  if (score < 0.9) return 'text-yellow-600'
  return 'text-green-600'
}

function dispositionBadge(disposition: string | undefined) {
  if (!disposition) return null
  const map: Record<string, { label: string; className: string }> = {
    auto_accept: { label: 'Auto Accept', className: 'bg-green-100 text-green-800 border-green-200' },
    accept_with_caution: { label: 'Caution', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    review_required: { label: 'Review Required', className: 'bg-orange-100 text-orange-800 border-orange-200' },
    reject: { label: 'Rejected', className: 'bg-red-100 text-red-800 border-red-200' },
  }
  const cfg = map[disposition] ?? { label: disposition, className: 'bg-gray-100 text-gray-700 border-gray-200' }
  return <Badge className={cn('shrink-0 border', cfg.className)}>{cfg.label}</Badge>
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'text-red-700 bg-red-50 border-red-200'
  if (severity === 'high') return 'text-orange-700 bg-orange-50 border-orange-200'
  if (severity === 'medium') return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-blue-700 bg-blue-50 border-blue-200'
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'all' | 'high_priority' | 'low_confidence' | 'critical_conflicts'

interface EditedFields {
  event_type: string
  event_date: string
  tach_time: string
  work_description: string
  mechanic_name: string
  mechanic_cert_number: string
  ad_references: string
}

// ─── Engine Comparison Panel ──────────────────────────────────────────────────

function EngineComparisonPanel({ reviewPacket }: { reviewPacket: any }) {
  const engineOutputs: any[] = reviewPacket?.engine_outputs ?? []
  if (!engineOutputs.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Activity className="w-3.5 h-3.5" />
        Engine Comparison
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {engineOutputs.map((eng: any) => (
          <div key={eng.engine_name} className="rounded-md border bg-muted/30 p-2.5 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-foreground capitalize">
                {(eng.engine_name ?? '').replace(/_/g, ' ')}
              </span>
              {eng.error_message ? (
                <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Failed</Badge>
              ) : (
                <span className={cn('font-semibold', confidenceLabel(eng.confidence_score ?? 0))}>
                  {Math.round((eng.confidence_score ?? 0) * 100)}%
                </span>
              )}
            </div>
            {eng.error_message ? (
              <p className="text-red-600 italic text-[10px]">{eng.error_message}</p>
            ) : (
              <p className="text-muted-foreground font-mono leading-relaxed line-clamp-3">
                {eng.raw_text_snippet || '(no text)'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Field Conflicts Panel ─────────────────────────────────────────────────────

function FieldConflictsPanel({ reviewPacket }: { reviewPacket: any }) {
  const conflicts: any[] = reviewPacket?.conflicts ?? []
  if (!conflicts.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 text-orange-500" />
        Field Conflicts ({conflicts.length})
      </p>
      <div className="space-y-1.5">
        {conflicts.map((conflict: any, i: number) => (
          <div key={i} className={cn('rounded-md border p-2 text-xs', severityColor(conflict.severity))}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold capitalize">
                {(conflict.field_name ?? '').replace(/_/g, ' ')}
              </span>
              <span className="capitalize font-medium text-[10px] uppercase tracking-wider">
                {conflict.severity}
              </span>
            </div>
            <p className="opacity-80 mb-1">{conflict.conflict_reason}</p>
            <div className="flex flex-wrap gap-1">
              {(conflict.candidate_values ?? []).map((cv: any, j: number) => (
                <span key={j} className="rounded bg-white/60 border border-current/20 px-1.5 py-0.5 font-mono text-[10px]">
                  {cv.engine}: <strong>{String(cv.value ?? 'null')}</strong>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Arbitration Summary Panel ────────────────────────────────────────────────

function ArbitrationPanel({ item }: { item: any }) {
  const score: number = item.arbitration_score ?? 0
  const disposition: string = item.arbitration_result ?? ''
  const reasons: string[] = item.review_packet?.review_reasons ?? []
  const criticalCount: number = item.critical_fields_count ?? 0
  const conflictCount: number = item.conflict_count ?? 0

  return (
    <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-500" />
          Arbitration Result
        </p>
        {dispositionBadge(disposition)}
      </div>

      {/* Score bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Arbitration Score</span>
          <span className={cn('font-semibold', confidenceLabel(score))}>
            {Math.round(score * 100)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', confidenceColor(score))}
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        {conflictCount > 0 && (
          <span className="text-orange-600 font-medium">
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </span>
        )}
        {criticalCount > 0 && (
          <span className="text-red-600 font-medium">
            {criticalCount} critical
          </span>
        )}
      </div>

      {/* Review reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1">
          {reasons.map((reason: string, i: number) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Recommended Fields Panel ─────────────────────────────────────────────────

function RecommendedFieldsPanel({ reviewPacket }: { reviewPacket: any }) {
  const fieldSummary: Record<string, any> = reviewPacket?.field_summary ?? {}
  const entries = Object.entries(fieldSummary).filter(([, v]: [string, any]) => v.best_value != null)
  if (!entries.length) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-blue-500" />
        Arbitrated Field Values
      </p>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Field</th>
              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Best Value</th>
              <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Conf.</th>
              <th className="text-center px-3 py-1.5 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([field, info]: [string, any], i) => (
              <tr key={field} className={cn('border-t', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                <td className="px-3 py-1.5 font-medium capitalize">
                  {field.replace(/_/g, ' ')}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] max-w-[150px] truncate">
                  {Array.isArray(info.best_value)
                    ? info.best_value.join(', ')
                    : String(info.best_value)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={confidenceLabel(info.best_confidence ?? 0)}>
                    {Math.round((info.best_confidence ?? 0) * 100)}%
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  {info.conflict_detected ? (
                    <span className="text-orange-500">⚠</span>
                  ) : (
                    <span className="text-green-500">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Queue Item Card ──────────────────────────────────────────────────────────

function QueueItemCard({
  item,
  onAction,
  loading,
}: {
  item: any
  onAction: (id: string, action: string, fields: EditedFields, extractedEventId?: string) => void
  loading: boolean
}) {
  const job = item.ocr_page_job ?? {}
  const event = item.ocr_extracted_event ?? {}
  const reviewPacket: any = item.review_packet ?? {}
  const [expanded, setExpanded] = useState(true)
  const [showEngines, setShowEngines] = useState(false)
  const confidence: number = item.arbitration_score ?? job.ocr_confidence ?? 0

  const [fields, setFields] = useState<EditedFields>({
    event_type: event.event_type ?? 'maintenance',
    event_date: event.event_date ?? '',
    tach_time: event.tach_time ?? '',
    work_description: event.work_description ?? job.ocr_raw_text ?? '',
    mechanic_name: event.mechanic_name ?? '',
    mechanic_cert_number: event.mechanic_cert_number ?? '',
    ad_references: Array.isArray(event.ad_references)
      ? event.ad_references.join(', ')
      : event.ad_references ?? '',
  })

  function update(key: keyof EditedFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  const docTitle = job.document?.title ?? 'Unknown Document'
  const pageNumber = job.page_number ?? '?'
  const hasConflicts = (item.conflict_count ?? 0) > 0
  const hasCritical = (item.critical_fields_count ?? 0) > 0

  return (
    <Card className={cn('overflow-hidden', hasCritical && 'border-red-300')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge variant="secondary" className="shrink-0">
              <FileText className="w-3 h-3 mr-1" />
              {docTitle}
            </Badge>
            <Badge variant="outline" className="shrink-0">
              Page {pageNumber}
            </Badge>
            {job.page_classification && (
              <Badge className="shrink-0 bg-blue-100 text-blue-800 border-blue-200">
                {formatClassification(job.page_classification)}
              </Badge>
            )}
            {dispositionBadge(item.arbitration_result)}
            {hasCritical && (
              <Badge className="shrink-0 bg-red-100 text-red-800 border-red-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Critical Conflicts
              </Badge>
            )}
            {!hasCritical && hasConflicts && (
              <Badge className="shrink-0 bg-orange-100 text-orange-800 border-orange-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {item.conflict_count} Conflict{item.conflict_count !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {/* Confidence meter */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">
              {item.arbitration_score != null ? 'Arbitration Score' : 'OCR Confidence'}
            </span>
            <span className={cn('font-semibold', confidenceLabel(confidence))}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', confidenceColor(confidence))}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-5">
          {/* Arbitration summary */}
          {item.arbitration_result && <ArbitrationPanel item={item} />}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: raw OCR + conflict/engine panels */}
            <div className="space-y-4">
              {/* Raw OCR text */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Raw OCR Text (Best Engine)
                </p>
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
              </div>

              {/* Field conflicts */}
              {hasConflicts && <FieldConflictsPanel reviewPacket={reviewPacket} />}

              {/* Arbitrated field values */}
              {reviewPacket.field_summary && <RecommendedFieldsPanel reviewPacket={reviewPacket} />}

              {/* Engine comparison toggle */}
              {(reviewPacket.engine_outputs?.length > 0) && (
                <div>
                  <button
                    onClick={() => setShowEngines(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Activity className="w-3 h-3" />
                    {showEngines ? 'Hide' : 'Show'} Engine Outputs
                    {showEngines ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showEngines && (
                    <div className="mt-2">
                      <EngineComparisonPanel reviewPacket={reviewPacket} />
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Queued {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* RIGHT: extracted fields editor */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Correct &amp; Approve Fields
              </p>

              {/* Entry type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Entry Type</label>
                <select
                  value={fields.event_type}
                  onChange={(e) => update('event_type', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="maintenance">Maintenance</option>
                  <option value="annual">Annual Inspection</option>
                  <option value="100hr">100-Hour Inspection</option>
                  <option value="oil_change">Oil Change</option>
                  <option value="repair">Repair</option>
                  <option value="ad_compliance">AD Compliance</option>
                  <option value="overhaul">Overhaul</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                <input
                  type="date"
                  value={fields.event_date}
                  onChange={(e) => update('event_date', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Tach/TT */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tach / TT (hours)</label>
                <input
                  type="number"
                  step="0.1"
                  value={fields.tach_time}
                  onChange={(e) => update('tach_time', e.target.value)}
                  placeholder="e.g. 1234.5"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Work description */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Work Description</label>
                <textarea
                  value={fields.work_description}
                  onChange={(e) => update('work_description', e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
                />
              </div>

              {/* Mechanic name + cert */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Mechanic Name</label>
                  <input
                    type="text"
                    value={fields.mechanic_name}
                    onChange={(e) => update('mechanic_name', e.target.value)}
                    placeholder="John Smith"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Cert #</label>
                  <input
                    type="text"
                    value={fields.mechanic_cert_number}
                    onChange={(e) => update('mechanic_cert_number', e.target.value)}
                    placeholder="A&P 1234567"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
              </div>

              {/* AD References */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">AD References</label>
                <input
                  type="text"
                  value={fields.ad_references}
                  onChange={(e) => update('ad_references', e.target.value)}
                  placeholder="e.g. 2023-14-05, 2021-08-10"
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'approve', fields, event.id)}
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Approve &amp; Canonicalize
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'reject', fields, event.id)}
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Reject
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="text-muted-foreground"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'unreadable', fields, event.id)}
                >
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                  Unreadable
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => onAction(item.id, 'skip', fields, event.id)}
                >
                  <SkipForward className="w-3.5 h-3.5 mr-1.5" />
                  Skip
                </Button>
              </div>

              <p className="text-xs text-muted-foreground flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                Approving creates a canonical maintenance record that powers search, reminders, and compliance tracking.
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReviewQueueClient({
  items: initialItems,
  orgId,
}: {
  items: any[]
  orgId: string
}) {
  const [items, setItems] = useState<any[]>(initialItems)
  const [filter, setFilter] = useState<FilterType>('all')
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})

  const filtered = items.filter((item) => {
    const confidence = item.arbitration_score ?? item.ocr_page_job?.ocr_confidence ?? 1
    if (filter === 'high_priority') return item.priority === 'high'
    if (filter === 'low_confidence') return confidence < 0.6
    if (filter === 'critical_conflicts') return (item.critical_fields_count ?? 0) > 0
    return true
  })

  async function handleAction(
    id: string,
    action: string,
    correctedFields: EditedFields,
    extractedEventId?: string
  ) {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    try {
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
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      // Silent fail — item stays in queue
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'high_priority', label: 'High Priority' },
    { key: 'low_confidence', label: 'Low Confidence' },
    { key: 'critical_conflicts', label: 'Critical Conflicts' },
  ]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">OCR Review Queue</h1>
                <p className="text-sm text-muted-foreground">
                  Multi-engine arbitration results awaiting human review
                </p>
              </div>
            </div>
          </div>
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

        {/* Filter row */}
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
              {items.length === 0 ? 'Review queue is empty!' : 'No items match this filter'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {items.length === 0
                ? 'All extractions have been arbitrated and reviewed. High-confidence pages were auto-accepted into the canonical record.'
                : 'Try a different filter to see more items.'}
            </p>
          </div>
        )}

        {/* Queue items */}
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
