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
  if (score < 0.8) return 'bg-amber-500'
  return 'bg-green-500'
}

function confidenceLabel(score: number): string {
  if (score < 0.5) return 'text-red-600'
  if (score < 0.8) return 'text-amber-600'
  return 'text-green-600'
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface OcrPageJob {
  ocr_confidence?: number
  ocr_raw_text?: string
  page_number?: number | string
  page_classification?: string
  document?: { title?: string }
}

interface OcrExtractedEvent {
  id?: string
  event_type?: string
  event_date?: string
  tach_time?: string | number
  work_description?: string
  mechanic_name?: string
  mechanic_cert_number?: string
  ad_references?: string[] | string
}

interface ReviewItem {
  id: string
  review_reason?: string
  priority?: number
  created_at: string
  ocr_page_job?: OcrPageJob
  ocr_extracted_event?: OcrExtractedEvent
}

type FilterType = 'all' | 'high_priority' | 'low_confidence' | 'unreadable'

interface EditedFields {
  event_type: string
  event_date: string
  tach_time: string
  work_description: string
  mechanic_name: string
  mechanic_cert_number: string
  ad_references: string
}

// ─── Queue Item Card ──────────────────────────────────────────────────────────

function QueueItemCard({
  item,
  onAction,
  loading,
}: {
  item: ReviewItem
  onAction: (id: string, action: string, fields: EditedFields, extractedEventId?: string) => void
  loading: boolean
}) {
  const job = item.ocr_page_job ?? {}
  const event = item.ocr_extracted_event ?? {}
  const [expanded, setExpanded] = useState(true)
  const confidence: number = job.ocr_confidence ?? 0

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

  return (
    <Card className="overflow-hidden">
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
            {item.review_reason && (
              <Badge className="shrink-0 bg-orange-100 text-orange-800 border-orange-200">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {item.review_reason}
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
            <span className="text-muted-foreground font-medium">OCR Confidence</span>
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
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: page info */}
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Raw OCR Text
                </p>
                <div
                  className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-y-auto border"
                  style={{ maxHeight: 200 }}
                >
                  {job.ocr_raw_text ? (
                    <pre className="whitespace-pre-wrap break-words">{job.ocr_raw_text}</pre>
                  ) : (
                    <span className="text-muted-foreground italic">No raw text captured</span>
                  )}
                </div>
              </div>

              {item.review_reason && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-medium text-amber-800 mb-0.5">Review Reason</p>
                  <p className="text-xs text-amber-700">{item.review_reason}</p>
                </div>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Queued {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>

            {/* RIGHT: extracted fields */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Extracted Fields
              </p>

              {/* Entry type */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Entry Type
                </label>
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
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={fields.event_date}
                  onChange={(e) => update('event_date', e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Tach/TT */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Tach / TT (hours)
                </label>
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
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Work Description
                </label>
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
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Mechanic Name
                  </label>
                  <input
                    type="text"
                    value={fields.mechanic_name}
                    onChange={(e) => update('mechanic_name', e.target.value)}
                    placeholder="John Smith"
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Cert #
                  </label>
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
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  AD References
                </label>
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
                  Approve
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
                  Mark Unreadable
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
  items: ReviewItem[]
  orgId: string
}) {
  const [items, setItems] = useState<ReviewItem[]>(initialItems)
  const [filter, setFilter] = useState<FilterType>('all')
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({})

  // Filter logic
  const filtered = items.filter((item) => {
    const confidence = item.ocr_page_job?.ocr_confidence ?? 1
    if (filter === 'high_priority') return (item.priority ?? 0) >= 2
    if (filter === 'low_confidence') return confidence < 0.6
    if (filter === 'unreadable') return item.review_reason === 'unreadable'
    return true
  })

  async function handleAction(
    id: string,
    action: string,
    correctedFields: EditedFields,
    extractedEventId?: string
  ) {
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    setActionErrors((prev) => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch('/api/ocr/review', {
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
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionErrors((prev) => ({ ...prev, [id]: body.error ?? `Error ${res.status}` }))
      } else {
        // Remove from list on success
        setItems((prev) => prev.filter((i) => i.id !== id))
      }
    } catch {
      setActionErrors((prev) => ({ ...prev, [id]: 'Network error — action may not have saved.' }))
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'high_priority', label: 'High Priority' },
    { key: 'low_confidence', label: 'Low Confidence (< 60%)' },
    { key: 'unreadable', label: 'Unreadable' },
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
                  Review low-confidence extractions before they are indexed
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
                ? 'All OCR extractions have been reviewed or meet confidence thresholds.'
                : 'Try a different filter to see more items.'}
            </p>
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                Documents processed with high confidence appear directly in search without review.
              </p>
            )}
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
