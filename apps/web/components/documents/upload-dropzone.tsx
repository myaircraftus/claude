'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatBytes, DOC_TYPE_LABELS } from '@/lib/utils'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { FileUploadItem, DocType, ParsingStatus, ManualAccess } from '@/types'

// Doc types eligible for community listing (manuals)
const MANUAL_TYPES: DocType[] = ['maintenance_manual', 'service_manual', 'parts_catalog']

// ─── Types ────────────────────────────────────────────────────────────────────

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

interface UploadDropzoneProps {
  aircraftOptions: AircraftOption[]
  onUploadComplete: () => void
}

// ─── ProcessingStatusBadge ────────────────────────────────────────────────────

function ProcessingStatusBadge({ status }: { status: ParsingStatus }) {
  const inProgress: ParsingStatus[] = ['queued', 'parsing', 'chunking', 'embedding', 'ocr_processing']
  const isInProgress = inProgress.includes(status)

  const colorMap: Record<ParsingStatus, string> = {
    queued: 'bg-slate-100 text-slate-700 border-slate-200',
    parsing: 'bg-blue-50 text-blue-700 border-blue-200',
    chunking: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    embedding: 'bg-violet-50 text-violet-700 border-violet-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    needs_ocr: 'bg-amber-50 text-amber-700 border-amber-200',
    ocr_processing: 'bg-orange-50 text-orange-700 border-orange-200',
  }

  const labelMap: Record<ParsingStatus, string> = {
    queued: 'Queued',
    parsing: 'Parsing',
    chunking: 'Chunking',
    embedding: 'Embedding',
    completed: 'Indexed',
    failed: 'Failed',
    needs_ocr: 'Needs OCR',
    ocr_processing: 'OCR',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border',
        colorMap[status]
      )}
    >
      {isInProgress && (
        <span className="flex gap-0.5 items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1 h-1 rounded-full bg-current animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      )}
      {status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'failed' && <AlertCircle className="w-3 h-3" />}
      {labelMap[status]}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS) as [DocType, string][]

export function UploadDropzone({ aircraftOptions, onUploadComplete }: UploadDropzoneProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  // Map from documentId → realtime parsing status
  const [parsingStatuses, setParsingStatuses] = useState<Record<string, ParsingStatus>>({})
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>['channel']> | null>(null)

  // Subscribe to realtime updates for documents we've uploaded
  useEffect(() => {
    const docIds = files
      .filter((f) => f.documentId)
      .map((f) => f.documentId as string)

    if (docIds.length === 0) return

    const supabase = createBrowserSupabase()

    // Clean up previous subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel('document-parsing-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `id=in.(${docIds.join(',')})`,
        },
        (payload) => {
          const doc = payload.new as { id: string; parsing_status: ParsingStatus }
          setParsingStatuses((prev) => ({ ...prev, [doc.id]: doc.parsing_status }))
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [files.map((f) => f.documentId).join(',')])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newItems: FileUploadItem[] = acceptedFiles.map((file) => ({
        file,
        id: crypto.randomUUID(),
        aircraftId: undefined,
        docType: 'miscellaneous' as DocType,
        manualAccess: 'private' as ManualAccess,
        price: '',
        attestation: false,
        status: 'pending' as const,
        progress: 0,
      }))
      setFiles((prev) => [...prev, ...newItems])
    },
    []
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 500 * 1024 * 1024, // 500 MB
    multiple: true,
    disabled: isUploading,
  })

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function updateFile(id: string, patch: Partial<FileUploadItem>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  async function uploadFile(item: FileUploadItem): Promise<void> {
    updateFile(item.id, { status: 'uploading', progress: 0 })

    const formData = new FormData()
    formData.append('file', item.file)
    formData.append('doc_type', item.docType)
    formData.append('title', item.file.name.replace(/\.pdf$/i, ''))
    if (item.aircraftId) {
      formData.append('aircraft_id', item.aircraftId)
    }
    // Manual-access fields (only send for manual types)
    if (MANUAL_TYPES.includes(item.docType)) {
      formData.append('manual_access', item.manualAccess)
      if (item.manualAccess === 'paid' && item.price) {
        formData.append('price', item.price)
      }
      formData.append('attestation', String(item.attestation))
    }

    try {
      // Use XMLHttpRequest for upload progress tracking
      const documentId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90) // cap at 90 until server responds
            updateFile(item.id, { progress: pct })
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText) as { document_id: string; status: string }
              resolve(json.document_id)
            } catch {
              reject(new Error('Invalid response from server'))
            }
          } else {
            let msg = `Upload failed (${xhr.status})`
            try {
              const json = JSON.parse(xhr.responseText) as { error?: string }
              if (json.error) msg = json.error
            } catch { /* ignore */ }
            reject(new Error(msg))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Network error')))
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

        xhr.open('POST', '/api/upload')
        xhr.send(formData)
      })

      updateFile(item.id, { status: 'processing', progress: 100, documentId })
    } catch (err) {
      updateFile(item.id, {
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  async function handleUploadAll() {
    const pending = files.filter((f) => f.status === 'pending' || f.status === 'error')
    if (pending.length === 0) return

    // Block if any manual listing missing attestation
    const blocked = pending.find(
      (f) =>
        MANUAL_TYPES.includes(f.docType) &&
        (f.manualAccess === 'free' || f.manualAccess === 'paid') &&
        !f.attestation
    )
    if (blocked) {
      updateFile(blocked.id, {
        status: 'error',
        error: 'Please accept the community library terms',
      })
      return
    }

    setIsUploading(true)
    try {
      for (const item of pending) {
        await uploadFile(item)
      }
      const allDone = files.every((f) => f.status === 'completed' || f.status === 'processing')
      if (allDone) onUploadComplete()
    } finally {
      setIsUploading(false)
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length
  const hasFiles = files.length > 0

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer',
          isDragActive
            ? 'border-brand-400 bg-brand-50'
            : 'border-border hover:border-brand-300 hover:bg-muted/30',
          isUploading && 'opacity-50 pointer-events-none'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
            <Upload className="h-5 w-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {isDragActive ? 'Drop PDFs here' : 'Drag & drop PDFs, or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">PDF only · Max 500 MB per file</p>
          </div>
        </div>
      </div>

      {/* File queue */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((item) => {
            const realtimeStatus = item.documentId ? parsingStatuses[item.documentId] : undefined

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card"
              >
                {/* Row 1: icon + name + status + remove */}
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-red-50 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-red-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                  </div>

                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {item.status === 'pending' && (
                      <Badge variant="secondary" className="text-xs">Pending</Badge>
                    )}
                    {item.status === 'uploading' && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Uploading…
                      </span>
                    )}
                    {item.status === 'processing' && realtimeStatus && (
                      <ProcessingStatusBadge status={realtimeStatus} />
                    )}
                    {item.status === 'processing' && !realtimeStatus && (
                      <ProcessingStatusBadge status="queued" />
                    )}
                    {item.status === 'completed' && (
                      <ProcessingStatusBadge status="completed" />
                    )}
                    {item.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {item.error ?? 'Error'}
                      </span>
                    )}
                  </div>

                  {/* Remove */}
                  {item.status !== 'uploading' && (
                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Row 2: selectors (only when pending or error) */}
                {(item.status === 'pending' || item.status === 'error') && (
                  <div className="flex gap-2 pl-11">
                    {/* Aircraft selector */}
                    <Select
                      value={item.aircraftId ?? '__none__'}
                      onValueChange={(val) =>
                        updateFile(item.id, {
                          aircraftId: val === '__none__' ? undefined : val,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Aircraft (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No aircraft (general)</SelectItem>
                        {aircraftOptions.map((ac) => (
                          <SelectItem key={ac.id} value={ac.id}>
                            {ac.tail_number} — {ac.make} {ac.model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Doc type selector */}
                    <Select
                      value={item.docType}
                      onValueChange={(val) =>
                        updateFile(item.id, { docType: val as DocType })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPE_OPTIONS.map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Manual-access controls — only for manual doc types */}
                {(item.status === 'pending' || item.status === 'error') &&
                  MANUAL_TYPES.includes(item.docType) && (
                    <div className="pl-11 space-y-2">
                      <div className="flex gap-1 rounded-md border border-border p-0.5 bg-muted/30">
                        {(['private', 'free', 'paid'] as ManualAccess[]).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => updateFile(item.id, { manualAccess: level })}
                            className={cn(
                              'flex-1 px-3 py-1 text-xs rounded font-medium transition-colors',
                              item.manualAccess === level
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {level === 'private' ? 'Private' : level === 'free' ? 'Free download' : 'Paid'}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground p-2 bg-amber-50 border border-amber-200 rounded">
                        Manuals, service manuals, and parts catalogs can stay private or become
                        community downloads. Paid listings follow the requested 50% uploader /
                        50% myaircraft.us split.
                      </p>
                      {item.manualAccess === 'paid' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Price $</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(e) => updateFile(item.id, { price: e.target.value })}
                            className="h-7 px-2 text-xs border border-border rounded w-24 bg-background"
                            placeholder="0.00"
                          />
                          {item.price && Number(item.price) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              You earn ${(Number(item.price) * 0.5).toFixed(2)} per download
                            </span>
                          )}
                        </div>
                      )}
                      {(item.manualAccess === 'free' || item.manualAccess === 'paid') && (
                        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.attestation}
                            onChange={(e) => updateFile(item.id, { attestation: e.target.checked })}
                            className="mt-0.5"
                          />
                          <span>
                            I certify I have the right to share this document and accept the
                            community library terms.
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                {/* Progress bar during upload */}
                {item.status === 'uploading' && (
                  <div className="pl-11">
                    <Progress value={item.progress} className="h-1.5" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload All button */}
      {pendingCount > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleUploadAll} disabled={isUploading} size="sm">
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload {pendingCount} {pendingCount === 1 ? 'file' : 'files'}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
