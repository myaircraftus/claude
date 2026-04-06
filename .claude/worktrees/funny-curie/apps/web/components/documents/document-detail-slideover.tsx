'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ExternalLink,
  FileText,
  Plane,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  Info,
} from 'lucide-react'
import { cn, formatBytes, formatDateTime, DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { Document, ParsingStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentDetailSlideoverProps {
  document: Document | null
  onClose: () => void
}

// ─── Parsing status step config ───────────────────────────────────────────────

const PARSING_STEPS: { status: ParsingStatus; label: string }[] = [
  { status: 'queued', label: 'Queued' },
  { status: 'parsing', label: 'Parsing PDF' },
  { status: 'chunking', label: 'Chunking Text' },
  { status: 'embedding', label: 'Embedding' },
  { status: 'completed', label: 'Indexed' },
]

const OCR_STEPS: { status: ParsingStatus; label: string }[] = [
  { status: 'queued', label: 'Queued' },
  { status: 'needs_ocr', label: 'OCR Required' },
  { status: 'ocr_processing', label: 'Running OCR' },
  { status: 'chunking', label: 'Chunking Text' },
  { status: 'embedding', label: 'Embedding' },
  { status: 'completed', label: 'Indexed' },
]

function stepIndexForStatus(status: ParsingStatus, isOcr: boolean): number {
  const steps = isOcr ? OCR_STEPS : PARSING_STEPS
  const idx = steps.findIndex((s) => s.status === status)
  if (idx === -1) {
    // completed = last step
    if (status === 'completed') return steps.length - 1
    return 0
  }
  return idx
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ParsingStatus }) {
  const colorMap: Record<ParsingStatus, string> = {
    queued: 'bg-slate-100 text-slate-700',
    parsing: 'bg-blue-100 text-blue-700',
    chunking: 'bg-indigo-100 text-indigo-700',
    embedding: 'bg-violet-100 text-violet-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
    needs_ocr: 'bg-amber-100 text-amber-700',
    ocr_processing: 'bg-orange-100 text-orange-700',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        colorMap[status]
      )}
    >
      {status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'failed' && <AlertCircle className="w-3 h-3" />}
      {PARSING_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function ParseStepsViz({ status, ocr }: { status: ParsingStatus; ocr: boolean }) {
  const steps = ocr ? OCR_STEPS : PARSING_STEPS
  const activeIdx = stepIndexForStatus(status, ocr)
  const isFailed = status === 'failed'

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isDone = !isFailed && i < activeIdx
        const isActive = !isFailed && i === activeIdx
        const isFuture = isFailed ? true : i > activeIdx

        return (
          <div key={step.status} className="flex items-center gap-1">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
                  isDone && 'bg-green-500 text-white',
                  isActive && !isFailed && 'bg-blue-500 text-white ring-2 ring-blue-200',
                  isFuture && !isFailed && 'bg-muted text-muted-foreground',
                  isFailed && i <= activeIdx && 'bg-red-500 text-white',
                  isFailed && i > activeIdx && 'bg-muted text-muted-foreground'
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : isActive && !isFailed ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-[9px] text-muted-foreground text-center leading-tight w-12">
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-4 rounded-full mb-3',
                  isDone ? 'bg-green-400' : 'bg-muted'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="text-xs text-foreground text-right flex-1">{children}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentDetailSlideover({ document, onClose }: DocumentDetailSlideoverProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState<ParsingStatus | null>(null)

  const doc = document
  const status = currentStatus ?? doc?.parsing_status

  async function handleOpenOriginal() {
    if (!doc) return
    setFetchingUrl(true)
    try {
      const supabase = createBrowserSupabase()
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 60 * 60) // 1 hour

      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
        setSignedUrl(data.signedUrl)
      }
    } catch (err) {
      console.error('Failed to get signed URL:', err)
    } finally {
      setFetchingUrl(false)
    }
  }

  async function handleRetry() {
    if (!doc) return
    setRetrying(true)
    setRetryError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, {
        method: 'POST',
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      setCurrentStatus('queued')
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        {doc && (
          <>
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-base font-semibold leading-snug line-clamp-2">
                    {doc.title}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </Badge>
                    {status && <StatusBadge status={status} />}
                    {doc.source_provider === 'google_drive' && (
                      <Badge variant="secondary" className="text-xs">Google Drive</Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(85vh-160px)]">
              <div className="px-6 py-4 space-y-5">

                {/* File information */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    File Info
                  </h3>
                  <div className="rounded-lg border border-border divide-y divide-border">
                    <div className="px-3">
                      {doc.file_size_bytes != null && (
                        <InfoRow label="Size">{formatBytes(doc.file_size_bytes)}</InfoRow>
                      )}
                      {doc.page_count != null && (
                        <InfoRow label="Pages">{doc.page_count.toLocaleString()}</InfoRow>
                      )}
                      <InfoRow label="Uploaded">{formatDateTime(doc.uploaded_at)}</InfoRow>
                      <InfoRow label="Source">
                        {doc.source_provider === 'google_drive' ? 'Google Drive' : 'Direct Upload'}
                      </InfoRow>
                      {doc.revision && (
                        <InfoRow label="Revision">{doc.revision}</InfoRow>
                      )}
                      {doc.document_date && (
                        <InfoRow label="Document date">{doc.document_date}</InfoRow>
                      )}
                    </div>
                  </div>
                </section>

                {/* Aircraft */}
                {doc.aircraft_id && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Aircraft
                    </h3>
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                      <Plane className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-foreground font-mono">
                        {doc.aircraft_id}
                      </span>
                    </div>
                  </section>
                )}

                {/* Description */}
                {doc.description && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Description
                    </h3>
                    <p className="text-sm text-foreground leading-relaxed">{doc.description}</p>
                  </section>
                )}

                {/* Parsing status visualization */}
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Processing Status
                  </h3>
                  <ParseStepsViz status={status ?? 'queued'} ocr={doc.ocr_required} />
                </section>

                {/* OCR note */}
                {doc.ocr_required && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      This document requires OCR processing. Text was extracted via optical character
                      recognition, which may affect search accuracy.
                    </p>
                  </div>
                )}

                {/* Completed: page count call-out */}
                {status === 'completed' && doc.page_count != null && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Indexed Pages
                    </h3>
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-green-200 bg-green-50">
                      <Eye className="h-4 w-4 text-green-600 shrink-0" />
                      <p className="text-sm text-green-800 font-medium">
                        {doc.page_count.toLocaleString()} {doc.page_count === 1 ? 'page' : 'pages'} indexed and searchable
                      </p>
                    </div>
                  </section>
                )}

                {/* Failed: error message + retry */}
                {status === 'failed' && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Parse Error
                    </h3>
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800 font-mono leading-relaxed break-all">
                          {doc.parse_error ?? 'An unknown error occurred during parsing.'}
                        </p>
                      </div>
                      {retryError && (
                        <p className="text-xs text-red-700">{retryError}</p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRetry}
                        disabled={retrying}
                        className="border-red-300 text-red-700 hover:bg-red-100"
                      >
                        {retrying ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Re-queueing…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1.5 h-3 w-3" />
                            Retry Parsing
                          </>
                        )}
                      </Button>
                    </div>
                  </section>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex gap-2 pb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleOpenOriginal}
                    disabled={fetchingUrl}
                  >
                    {fetchingUrl ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open original
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
