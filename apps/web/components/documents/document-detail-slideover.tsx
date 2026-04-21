'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
  Loader2,
  Eye,
  Info,
  Trash2,
} from 'lucide-react'
import { cn, formatBytes, formatDateTime, DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import { resolveStoredDocumentClassification } from '@/lib/documents/taxonomy'
import { getDocumentClassificationProfile } from '@/lib/documents/classification'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { Document, ParsingStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentDetailSlideoverProps {
  document: Document | null
  onClose: () => void
  onDeleted?: (documentId: string) => void
  onDocumentPatched?: (documentId: string, patch: Partial<Document>) => void
  canDelete?: boolean
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
  const isCompleted = status === 'completed'

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isDone = !isFailed && (i < activeIdx || (isCompleted && i === activeIdx))
        const isActive = !isFailed && !isCompleted && i === activeIdx
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

export function DocumentDetailSlideover({
  document,
  onClose,
  onDeleted,
  onDocumentPatched,
  canDelete = false,
}: DocumentDetailSlideoverProps) {
  const [liveDocument, setLiveDocument] = useState<Document | null>(document)
  const [statusHydrated, setStatusHydrated] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [currentStatus, setCurrentStatus] = useState<ParsingStatus | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const doc = liveDocument?.id === document?.id ? liveDocument : document
  const status = currentStatus ?? doc?.parsing_status
  const processingStartedAt =
    doc?.parse_started_at ?? doc?.updated_at ?? doc?.uploaded_at ?? null
  const processingAgeMs = processingStartedAt
    ? Date.now() - new Date(processingStartedAt).getTime()
    : 0
  const isPossiblyStuck =
    status != null &&
    ['queued', 'parsing', 'ocr_processing', 'chunking', 'embedding'].includes(status) &&
    processingAgeMs >= 15 * 60 * 1000
  // Statuses where manual retry should always be offered (vs. only when stale).
  const isRetryableStatus =
    status != null && ['failed', 'queued', 'needs_ocr'].includes(status)
  const showRetrySection = isRetryableStatus || isPossiblyStuck
  const classification = doc ? resolveStoredDocumentClassification(doc) : null
  let classificationProfile = null
  if (doc) {
    try {
      classificationProfile = getDocumentClassificationProfile(doc)
    } catch {
      classificationProfile = null
    }
  }

  useEffect(() => {
    setStatusHydrated(false)

    if (!document) {
      setLiveDocument(null)
      setCurrentStatus(null)
      return
    }

    setLiveDocument((prev) => {
      if (!prev || prev.id !== document.id) {
        return document
      }

      const prevUpdatedAt = prev.updated_at ? Date.parse(prev.updated_at) : 0
      const nextUpdatedAt = document.updated_at ? Date.parse(document.updated_at) : 0

      if (
        nextUpdatedAt >= prevUpdatedAt ||
        prev.parsing_status !== document.parsing_status ||
        prev.parse_error !== document.parse_error
      ) {
        return {
          ...prev,
          ...document,
        }
      }

      return prev
    })

    setCurrentStatus((prev) => {
      if (!document.parsing_status) return prev ?? null
      if (!prev) return document.parsing_status
      return document.parsing_status
    })
  }, [document])

  useEffect(() => {
    setRetryError(null)
    setDeleteError(null)
    setSignedUrl(null)
  }, [doc?.id])

  useEffect(() => {
    if (!doc?.id) return

    let cancelled = false

    const refresh = async () => {
      try {
        const latest = await syncLatestDocumentStatus(doc.id)
        if (!latest || cancelled) return

        setLiveDocument(latest)
        setCurrentStatus(latest.parsing_status)
        setStatusHydrated(true)
        onDocumentPatched?.(doc.id, {
          parsing_status: latest.parsing_status,
          parse_error: latest.parse_error ?? undefined,
          parse_started_at: latest.parse_started_at ?? undefined,
          parse_completed_at: latest.parse_completed_at ?? undefined,
          updated_at: latest.updated_at,
          page_count: latest.page_count,
        })
      } catch {
        if (!cancelled) setStatusHydrated(true)
        // Keep current UI if the refresh fails.
      }
    }

    void refresh()

    return () => {
      cancelled = true
    }
  }, [doc?.id])

  useEffect(() => {
    if (!doc?.id || !status) return
    if (!['queued', 'parsing', 'ocr_processing', 'chunking', 'embedding'].includes(status)) {
      return
    }

    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const latest = await syncLatestDocumentStatus(doc.id)
        if (!latest || cancelled) return

        setLiveDocument(latest)
        setCurrentStatus(latest.parsing_status)
        setStatusHydrated(true)
        onDocumentPatched?.(doc.id, {
          parsing_status: latest.parsing_status,
          parse_error: latest.parse_error ?? undefined,
          parse_started_at: latest.parse_started_at ?? undefined,
          parse_completed_at: latest.parse_completed_at ?? undefined,
          updated_at: latest.updated_at,
          page_count: latest.page_count,
        })
      } catch {
        // Polling is best-effort only.
      }
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [doc?.id, status, onDocumentPatched])

  async function syncLatestDocumentStatus(documentId: string) {
    const res = await fetch(`/api/documents/${documentId}?ts=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    if (!res.ok) return null

    const json = (await res.json()) as { document?: Document }
    return json.document ?? null
  }

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

  async function handleRetry(force = false) {
    if (!doc) return
    setRetrying(true)
    setRetryError(null)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
        signal: controller.signal,
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      setCurrentStatus('queued')
      setStatusHydrated(true)
      setLiveDocument((prev) =>
        prev && prev.id === doc.id
          ? {
              ...prev,
              parsing_status: 'queued',
              parse_error: undefined,
              parse_started_at: undefined,
              parse_completed_at: undefined,
              updated_at: new Date().toISOString(),
            }
          : prev
      )
      onDocumentPatched?.(doc.id, {
        parsing_status: 'queued',
        parse_error: undefined,
        parse_started_at: undefined,
        parse_completed_at: undefined,
        updated_at: new Date().toISOString(),
      })
      toast.success('Document re-queued for processing')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        try {
          const latest = await syncLatestDocumentStatus(doc.id)
          if (
            latest &&
            ['queued', 'parsing', 'ocr_processing', 'chunking', 'embedding', 'completed'].includes(
              latest.parsing_status
            )
          ) {
            setLiveDocument(latest)
            setCurrentStatus(latest.parsing_status)
            setStatusHydrated(true)
            onDocumentPatched?.(doc.id, {
              parsing_status: latest.parsing_status,
              parse_error: latest.parse_error ?? undefined,
              parse_started_at: latest.parse_started_at ?? undefined,
              parse_completed_at: latest.parse_completed_at ?? undefined,
              updated_at: latest.updated_at,
              page_count: latest.page_count,
            })
            setRetryError(null)
          } else {
            setRetryError('Re-queue request is still running. Please wait a moment and check the status again.')
          }
        } catch {
          setRetryError('Re-queue request is still running. Please wait a moment and check the status again.')
        }
      } else {
        const message = err instanceof Error ? err.message : 'Retry failed'
        setRetryError(message)
        toast.error('Failed to retry document', { description: message })
      }
    } finally {
      window.clearTimeout(timeout)
      setRetrying(false)
    }
  }

  async function handleDelete() {
    if (!doc || !canDelete || deleting) return
    const confirmed = window.confirm(
      `Delete "${doc.title}"? This removes the file, its processing artifacts, and any duplicate upload record.`
    )
    if (!confirmed) return

    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error ?? `HTTP ${res.status}`)
      }
      onDeleted?.(doc.id)
      onClose()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
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
                      {classification?.detailLabel ?? DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </Badge>
                    {classification && (
                      <Badge variant="secondary" className="text-xs">
                        {classification.groupLabel}
                      </Badge>
                    )}
                    {statusHydrated && status ? (
                      <StatusBadge status={status} />
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Refreshing status
                      </span>
                    )}
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
                      {classification && (
                        <InfoRow label="Vault section">{classification.groupLabel}</InfoRow>
                      )}
                      {classification && (
                        <InfoRow label="Document type">{classification.detailLabel}</InfoRow>
                      )}
                      {classificationProfile && (
                        <InfoRow label="Record family">
                          {classificationProfile.recordFamily.replace(/_/g, ' ')}
                        </InfoRow>
                      )}
                      {classificationProfile && (
                        <InfoRow label="Truth role">
                          {classificationProfile.truthRole.replace(/_/g, ' ')}
                        </InfoRow>
                      )}
                      {doc.document_subtype && (
                        <InfoRow label="Subtype / volume">{doc.document_subtype}</InfoRow>
                      )}
                      {!classification && (
                        <InfoRow label="Document type">
                          {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                        </InfoRow>
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
                        {doc.aircraft?.tail_number ?? doc.aircraft_id}
                      </span>
                      {doc.aircraft?.make && (
                        <span className="text-xs text-muted-foreground">
                          {[doc.aircraft.year, doc.aircraft.make, doc.aircraft.model]
                            .filter(Boolean)
                            .join(' ')}
                        </span>
                      )}
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
                  {statusHydrated ? (
                    <ParseStepsViz status={status ?? 'queued'} ocr={doc.ocr_required} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Checking latest processing state…
                    </div>
                  )}
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

                {classificationProfile && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Intelligence Profile
                    </h3>
                    <div className="rounded-lg border border-border divide-y divide-border">
                      <div className="px-3">
                        <InfoRow label="Reminder eligible">
                          {classificationProfile.canActivateReminder ? 'Yes' : 'No'}
                        </InfoRow>
                        <InfoRow label="AD evidence">
                          {classificationProfile.canSatisfyAdRequirement ? 'Eligible' : 'No'}
                        </InfoRow>
                        <InfoRow label="Visibility">
                          {classificationProfile.visibleTo.join(' · ')}
                        </InfoRow>
                        <InfoRow label="OCR routing">
                          {classificationProfile.parserStrategy.replace(/_/g, ' ')}
                        </InfoRow>
                        <InfoRow label="Segmentation">
                          {classificationProfile.needsSegmentation ? 'Needed' : 'Not needed'}
                        </InfoRow>
                      </div>
                    </div>
                  </section>
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

                {/* Failed, queued, needs_ocr, or stale in-progress: error/recovery */}
                {showRetrySection && (
                  <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      {status === 'failed'
                        ? 'Parse Error'
                        : status === 'queued'
                          ? 'Waiting in Queue'
                          : status === 'needs_ocr'
                            ? 'Needs OCR'
                            : 'Recovery'}
                    </h3>
                    <div
                      className={cn(
                        'p-3 rounded-lg space-y-2',
                        status === 'failed'
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-amber-50 border border-amber-200'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle
                          className={cn(
                            'h-4 w-4 shrink-0 mt-0.5',
                            status === 'failed' ? 'text-red-600' : 'text-amber-700'
                          )}
                        />
                        <p
                          className={cn(
                            'text-xs leading-relaxed',
                            status === 'failed'
                              ? 'text-red-800 font-mono break-all'
                              : 'text-amber-900'
                          )}
                        >
                          {status === 'failed'
                            ? doc.parse_error ?? 'An unknown error occurred during parsing.'
                            : status === 'queued'
                              ? 'This document is waiting to be processed. You can force it to re-enter the queue now.'
                              : status === 'needs_ocr'
                                ? 'This document is flagged as requiring OCR but has not started yet. Re-queue it to kick off OCR processing.'
                                : 'This document has been processing longer than expected. You can safely re-queue OCR/indexing.'}
                        </p>
                      </div>
                      {retryError && (
                        <p className="text-xs text-red-700">{retryError}</p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetry(isPossiblyStuck && status !== 'failed')}
                        disabled={retrying}
                        className={cn(
                          status === 'failed'
                            ? 'border-red-300 text-red-700 hover:bg-red-100'
                            : 'border-amber-300 text-amber-800 hover:bg-amber-100'
                        )}
                      >
                        {retrying ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Re-queueing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1.5 h-3 w-3" />
                            {status === 'failed'
                              ? 'Retry Parsing'
                              : status === 'needs_ocr'
                                ? 'Run OCR Now'
                                : 'Retry Processing'}
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
                  {canDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="border-red-200 text-red-700 hover:bg-red-50"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {deleteError && (
                  <p className="text-xs text-red-700 pb-2">{deleteError}</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
