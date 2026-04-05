'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle2, AlertCircle, FileText, Loader2, Lock, Unlock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatBytes, DOC_TYPE_LABELS } from '@/lib/utils'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { FileUploadItem, DocType, ParsingStatus } from '@/types'

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

const MANUAL_DOC_TYPES: DocType[] = ['maintenance_manual', 'service_manual', 'parts_catalog']

function isManualType(docType: DocType): boolean {
  return MANUAL_DOC_TYPES.includes(docType)
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
  const [parsingStatuses, setParsingStatuses] = useState<Record<string, ParsingStatus>>({})
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>['channel']> | null>(null)

  useEffect(() => {
    const docIds = files
      .filter((f) => f.documentId)
      .map((f) => f.documentId as string)

    if (docIds.length === 0) return

    const supabase = createBrowserSupabase()

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
        title: file.name.replace(/\.pdf$/i, ''),
        visibility: 'private' as const,
        notes: '',
        aircraftId: undefined,
        docType: 'miscellaneous' as DocType,
        bookAssignmentType: 'historical' as const,
        manualAccess: 'private' as const,
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
    maxSize: 500 * 1024 * 1024,
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

    // Ownership fields captured at submit time
    const communityListing = ['free', 'paid'].includes(item.manualAccess)

    const formData = new FormData()
    formData.append('file', item.file)
    formData.append('doc_type', item.docType)
    formData.append('title', item.title || item.file.name.replace(/\.pdf$/i, ''))
    formData.append('visibility', item.visibility)
    formData.append('notes', item.notes)
    formData.append('allow_download', 'false')
    formData.append('community_listing', String(communityListing))
    if (!isManualType(item.docType)) {
      formData.append('book_assignment_type', item.bookAssignmentType)
    }
    if (isManualType(item.docType)) {
      formData.append('manual_access', item.manualAccess)
      if (item.manualAccess === 'paid' && item.price) {
        formData.append('price', item.price)
      }
    }
    if (item.aircraftId) {
      formData.append('aircraft_id', item.aircraftId)
    }

    try {
      const documentId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90)
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
            const manual = isManualType(item.docType)
            const isPaid = item.manualAccess === 'paid'
            const needsAttestation = ['free', 'paid'].includes(item.manualAccess) && manual
            const uploaderShare = item.price ? (parseFloat(item.price) * 0.5).toFixed(2) : '0.00'

            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 p-3 rounded-lg border border-border bg-card"
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

                {/* Form fields — only when pending or error */}
                {(item.status === 'pending' || item.status === 'error') && (
                  <div className="pl-11 space-y-2.5">

                    {/* 1. Document Title */}
                    <Input
                      value={item.title}
                      onChange={(e) => updateFile(item.id, { title: e.target.value })}
                      placeholder="Document title (required)"
                      className="h-8 text-xs"
                    />

                    {/* 2. Visibility toggle — Private / Shared with team */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateFile(item.id, { visibility: 'private' })}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors',
                          item.visibility === 'private'
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        )}
                      >
                        <Lock className="h-3 w-3" /> Private
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFile(item.id, { visibility: 'team' })}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded text-xs border transition-colors',
                          item.visibility === 'team'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        )}
                      >
                        <Users className="h-3 w-3" /> Shared with team
                      </button>
                    </div>

                    {/* 3. Aircraft */}
                    <Select
                      value={item.aircraftId ?? '__none__'}
                      onValueChange={(val) =>
                        updateFile(item.id, {
                          aircraftId: val === '__none__' ? undefined : val,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
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

                    {/* 4. Notes */}
                    <Textarea
                      value={item.notes}
                      onChange={(e) => updateFile(item.id, { notes: e.target.value })}
                      placeholder="Notes (optional)"
                      className="text-xs min-h-[60px] resize-none"
                    />

                    {/* 5. Document Type */}
                    <Select
                      value={item.docType}
                      onValueChange={(val) =>
                        updateFile(item.id, {
                          docType: val as DocType,
                          manualAccess: 'private',
                          attestation: false,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
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

                    {/* 6. Book Assignment Type — non-manual types only */}
                    {!manual && (
                      <div className="flex gap-2">
                        {(['historical', 'present'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateFile(item.id, { bookAssignmentType: t })}
                            className={cn(
                              'px-2.5 py-1 rounded text-xs border transition-colors capitalize',
                              item.bookAssignmentType === t
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 7. Manual Access — manual types only */}
                    {manual && (
                      <>
                        <div className="flex gap-2">
                          {([
                            { value: 'private', label: 'Private' },
                            { value: 'free', label: 'Free Download' },
                            { value: 'paid', label: 'Paid' },
                          ] as const).map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() =>
                                updateFile(item.id, {
                                  manualAccess: value,
                                  attestation: false,
                                })
                              }
                              className={cn(
                                'px-2.5 py-1 rounded text-xs border transition-colors',
                                item.manualAccess === value
                                  ? 'bg-gray-900 text-white border-gray-900'
                                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* 7a. Disclosure text */}
                        <p className="text-xs text-muted-foreground mt-2 p-2 bg-amber-50 rounded">
                          Manuals, service manuals, and parts catalogs can stay private or become
                          community downloads. Paid listings follow the requested 50% uploader /
                          50% myaircraft.us split.
                        </p>
                      </>
                    )}

                    {/* 8. Price input — paid only */}
                    {manual && isPaid && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => updateFile(item.id, { price: e.target.value })}
                          placeholder="0.00"
                          className="h-8 text-xs w-28"
                        />
                      </div>
                    )}

                    {/* 9. Revenue preview — paid only */}
                    {manual && isPaid && item.price && (
                      <p className="text-xs text-muted-foreground">
                        You earn <span className="font-medium text-foreground">${uploaderShare}</span>{' '}
                        · myaircraft.us earns <span className="font-medium">${uploaderShare}</span>{' '}
                        (50 / 50 split)
                      </p>
                    )}

                    {/* 10. Attestation checkbox — free or paid manual */}
                    {needsAttestation && (
                      <div className="flex items-start gap-2">
                        <Checkbox
                          id={`attest-${item.id}`}
                          checked={item.attestation}
                          onCheckedChange={(checked) =>
                            updateFile(item.id, { attestation: !!checked })
                          }
                          className="mt-0.5"
                        />
                        <Label htmlFor={`attest-${item.id}`} className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                          I confirm I have the right to share this document and that sharing it
                          does not violate any copyright or licensing restrictions.
                        </Label>
                      </div>
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
