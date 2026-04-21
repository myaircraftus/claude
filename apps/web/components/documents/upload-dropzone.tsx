'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle2, AlertCircle, FileText, Loader2, Lock, Users, ChevronDown, ChevronUp } from 'lucide-react'
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
import type { FileUploadItem, DocType, ParsingStatus, ManualAccess, BookAssignment } from '@/types'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  deriveDocTypeFromClassification,
  getDocumentItem,
  getDocumentItemsForGroup,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'
import {
  getDocumentClassificationSummary,
  searchDocumentTaxonomy,
} from '@/lib/documents/classification'

// Doc types eligible for community listing (manuals)
const MANUAL_TYPES: DocType[] = ['maintenance_manual', 'service_manual', 'parts_catalog']

function isManualType(docType: DocType): boolean {
  return MANUAL_TYPES.includes(docType)
}

// Quick-select chips for the simplified upload UI
const QUICK_CHIPS: Array<{ label: string; groupId: string; detailId: string }> = [
  { label: 'Engine Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'engine_logbooks' },
  { label: 'Airframe Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'airframe_logbooks' },
  { label: 'Propeller Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'propeller_logbooks' },
  { label: 'POH', groupId: 'flight_crew_and_operating_documents', detailId: 'pilot_s_operating_handbook_poh' },
  { label: 'Annual Inspection', groupId: 'maintenance_program_and_inspection_records', detailId: 'annual_inspection_records' },
  { label: '100-Hour Inspection', groupId: 'maintenance_program_and_inspection_records', detailId: '100_hour_inspection_records' },
  { label: 'Work Order', groupId: 'work_orders_and_shop_records', detailId: 'maintenance_work_orders' },
  { label: 'Weight & Balance', groupId: 'airworthiness_and_certification', detailId: 'weight_and_balance_report' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

interface UploadDropzoneProps {
  aircraftOptions: AircraftOption[]
  defaultAircraftId?: string
  defaultDocType?: DocType
  defaultDocumentGroupId?: string
  defaultDocumentDetailId?: string
  defaultDocumentSubtype?: string
}

function buildFileSignature(file: File) {
  return [file.name, file.size, file.lastModified].join('::')
}

function getPersistedOwnerAircraftId() {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem('owner_selected_aircraft_id')?.trim()
  return value ? value : undefined
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

export function UploadDropzone({
  aircraftOptions,
  defaultAircraftId,
  defaultDocType = 'miscellaneous',
  defaultDocumentGroupId,
  defaultDocumentDetailId,
  defaultDocumentSubtype,
}: UploadDropzoneProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [parsingStatuses, setParsingStatuses] = useState<Record<string, ParsingStatus>>({})
  const [defaultAircraftSelection, setDefaultAircraftSelection] = useState<string>(
    () => defaultAircraftId ?? getPersistedOwnerAircraftId() ?? '__none__'
  )
  const [defaultDocumentGroupSelection, setDefaultDocumentGroupSelection] = useState<string>(
    defaultDocumentGroupId ?? DOCUMENT_TAXONOMY_GROUPS[0]?.id ?? '__none__'
  )
  const [defaultDocumentDetailSelection, setDefaultDocumentDetailSelection] = useState<string>(
    defaultDocumentDetailId ?? ''
  )
  const [defaultDocumentSubtypeSelection, setDefaultDocumentSubtypeSelection] = useState<string>(
    defaultDocumentSubtype ?? ''
  )
  const [dropError, setDropError] = useState<string | null>(null)
  const [classificationSearch, setClassificationSearch] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabase>['channel']> | null>(null)
  const deferredClassificationSearch = useDeferredValue(classificationSearch)
  const trackedDocumentIds = useMemo(
    () =>
      files
        .map((file) => file.documentId)
        .filter((documentId): documentId is string => Boolean(documentId)),
    [files]
  )
  const documentIdsSignature = useMemo(
    () => trackedDocumentIds.join(','),
    [trackedDocumentIds]
  )
  const classificationMatches = useMemo(
    () => searchDocumentTaxonomy(deferredClassificationSearch),
    [deferredClassificationSearch]
  )
  const selectedClassificationProfile = useMemo(
    () => getDocumentClassificationSummary(defaultDocumentDetailSelection),
    [defaultDocumentDetailSelection]
  )

  useEffect(() => {
    const persistedAircraftId = getPersistedOwnerAircraftId()
    const candidateAircraftId = defaultAircraftId ?? persistedAircraftId

    setDefaultAircraftSelection((previous) => {
      const previousIsValid =
        previous === '__none__' || aircraftOptions.some((aircraft) => aircraft.id === previous)
      if (defaultAircraftId && defaultAircraftId !== previous) {
        return defaultAircraftId
      }
      if (!previousIsValid) {
        return candidateAircraftId ?? '__none__'
      }
      if (previous === '__none__' && candidateAircraftId) {
        return candidateAircraftId
      }
      return previous
    })
  }, [aircraftOptions, defaultAircraftId])

  useEffect(() => {
    if (!isDocumentGroupId(defaultDocumentGroupSelection)) return
    const detailOptions = getDocumentItemsForGroup(defaultDocumentGroupSelection)
    if (detailOptions.length === 0) return
    const exists = detailOptions.some((item) => item.id === defaultDocumentDetailSelection)
    if (!exists) {
      setDefaultDocumentDetailSelection(detailOptions[0].id)
    }
  }, [defaultDocumentDetailSelection, defaultDocumentGroupSelection])

  useEffect(() => {
    const docIds = trackedDocumentIds

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
  }, [documentIdsSignature, trackedDocumentIds])

  useEffect(() => {
    if (Object.keys(parsingStatuses).length === 0) return

    setFiles((prev) =>
      prev.map((item) => {
        if (!item.documentId) return item

        const realtimeStatus = parsingStatuses[item.documentId]
        if (!realtimeStatus) return item

        if (realtimeStatus === 'completed' && item.status !== 'completed') {
          return {
            ...item,
            status: 'completed',
            progress: 100,
            error: undefined,
          }
        }

        if (realtimeStatus === 'failed' && item.status !== 'error') {
          return {
            ...item,
            status: 'error',
            progress: 0,
            error: item.error ?? 'Document processing failed after upload.',
          }
        }

        return item
      })
    )
  }, [parsingStatuses])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setDropError(null)
      const selectedAircraftId =
        defaultAircraftSelection === '__none__' ? undefined : defaultAircraftSelection
      const selectedDocType = deriveDocTypeFromClassification(defaultDocumentDetailSelection, defaultDocType)
      let duplicateCount = 0

      setFiles((prev) => {
        const existingSignatures = new Set(prev.map((item) => buildFileSignature(item.file)))
        const batchSignatures = new Set<string>()
        const newItems: FileUploadItem[] = []

        for (const file of acceptedFiles) {
          const signature = buildFileSignature(file)
          if (existingSignatures.has(signature) || batchSignatures.has(signature)) {
            duplicateCount += 1
            continue
          }

          batchSignatures.add(signature)
          newItems.push({
            file,
            id: crypto.randomUUID(),
            title: file.name.replace(/\.pdf$/i, ''),
            visibility: 'private' as const,
            notes: '',
            aircraftId: selectedAircraftId,
            docType: selectedDocType,
            documentGroupId: defaultDocumentGroupSelection,
            documentDetailId: defaultDocumentDetailSelection,
            documentSubtype: defaultDocumentSubtypeSelection || undefined,
            documentDate: '',
            bookAssignmentType: 'historical' as BookAssignment,
            manualAccess: 'private' as ManualAccess,
            price: '',
            attestation: false,
            status: 'pending' as const,
            progress: 0,
          })
        }

        return [...prev, ...newItems]
      })

      if (duplicateCount > 0) {
        setDropError(
          duplicateCount === acceptedFiles.length
            ? 'That PDF is already in the upload queue.'
            : `${duplicateCount} duplicate ${duplicateCount === 1 ? 'file was' : 'files were'} skipped.`
        )
      }
    },
    [
      defaultAircraftSelection,
      defaultDocType,
      defaultDocumentDetailSelection,
      defaultDocumentGroupSelection,
      defaultDocumentSubtypeSelection,
    ]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected: (fileRejections) => {
      const firstRejection = fileRejections[0]
      if (!firstRejection) {
        setDropError('Upload failed before the file could be added. Please try again.')
        return
      }

      const hasTypeError = firstRejection.errors.some((error) => error.code === 'file-invalid-type')
      const hasSizeError = firstRejection.errors.some((error) => error.code === 'file-too-large')

      if (hasTypeError) {
        setDropError('Only PDF files are supported in this upload flow right now.')
        return
      }

      if (hasSizeError) {
        setDropError('This file is larger than the 500 MB upload limit.')
        return
      }

      setDropError(firstRejection.errors[0]?.message ?? 'That file could not be uploaded.')
    },
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

  function applyDefaultClassificationToPendingFiles() {
    setFiles((prev) =>
      prev.map((item) => {
        if (item.status !== 'pending' && item.status !== 'error') return item
        return {
          ...item,
          documentGroupId: defaultDocumentGroupSelection,
          documentDetailId: defaultDocumentDetailSelection,
          documentSubtype: defaultDocumentSubtypeSelection || undefined,
          docType: deriveDocTypeFromClassification(defaultDocumentDetailSelection, item.docType),
          manualAccess: 'private',
          attestation: false,
        }
      })
    )
  }

  async function uploadFile(item: FileUploadItem): Promise<void> {
    updateFile(item.id, { status: 'uploading', progress: 0 })

    try {
      const initResponse = await fetch('/api/upload/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: item.file.name,
          fileSize: item.file.size,
          mimeType: item.file.type || 'application/pdf',
          aircraftId: item.aircraftId ?? null,
        }),
      })

      const initPayload = (await initResponse.json().catch(() => ({}))) as {
        error?: string
        documentId?: string
        storagePath?: string
        signedPath?: string
        signedUrl?: string
        uploadToken?: string
      }

      if (!initResponse.ok || !initPayload.documentId || !initPayload.uploadToken || !initPayload.storagePath) {
        throw new Error(initPayload.error || `Upload failed (${initResponse.status})`)
      }

      updateFile(item.id, { progress: 15 })

      const uploadPath = initPayload.signedPath ?? initPayload.storagePath
      const supabase = createBrowserSupabase()
      const { error: storageError } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(uploadPath, initPayload.uploadToken, item.file, {
          contentType: item.file.type || 'application/pdf',
        })

      if (storageError) {
        if (!initPayload.signedUrl) {
          throw new Error(storageError.message || 'Failed to upload file to storage')
        }

        let fallbackError = storageError.message || 'Failed to upload file to storage'

        try {
          const formData = new FormData()
          formData.append('cacheControl', '3600')
          formData.append('', item.file)

          const signedUploadResponse = await fetch(initPayload.signedUrl, {
            method: 'PUT',
            headers: {
              'x-upsert': 'false',
            },
            body: formData,
          })

          if (!signedUploadResponse.ok) {
            try {
              const errorPayload = (await signedUploadResponse.json()) as {
                error?: string
                message?: string
              }
              fallbackError =
                errorPayload.error ??
                errorPayload.message ??
                fallbackError
            } catch {
              const responseText = await signedUploadResponse.text().catch(() => '')
              if (responseText.trim().length > 0) {
                fallbackError = responseText.trim()
              }
            }

            throw new Error(fallbackError)
          }
        } catch (error) {
          const signedUrlError =
            error instanceof Error ? error.message : 'Signed upload request failed unexpectedly'

          throw new Error(
            [storageError.message, signedUrlError].filter(Boolean).join(' · ')
          )
        }
      }

      updateFile(item.id, { progress: 80 })

      const completeResponse = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: initPayload.documentId,
          storagePath: initPayload.storagePath,
          fileName: item.file.name,
          fileSize: item.file.size,
          mimeType: item.file.type || 'application/pdf',
          docType: item.docType,
          title: item.title || item.file.name.replace(/\.pdf$/i, ''),
          visibility: item.visibility,
          notes: item.notes,
          documentGroupId: item.documentGroupId ?? null,
          documentDetailId: item.documentDetailId ?? null,
          documentSubtype: item.documentSubtype ?? null,
          documentDate: item.documentDate || null,
          aircraftId: item.aircraftId ?? null,
          bookAssignmentType: !isManualType(item.docType) ? item.bookAssignmentType : null,
          manualAccess: isManualType(item.docType) ? item.manualAccess : null,
          price: isManualType(item.docType) && item.manualAccess === 'paid' ? item.price : null,
          attestation: isManualType(item.docType) ? item.attestation : false,
        }),
      })

      const completePayload = (await completeResponse.json().catch(() => ({}))) as {
        error?: string
        document_id?: string
      }

      if (!completeResponse.ok || !completePayload.document_id) {
        throw new Error(completePayload.error || `Upload failed (${completeResponse.status})`)
      }

      updateFile(item.id, {
        status: 'processing',
        progress: 100,
        documentId: completePayload.document_id,
        error: undefined,
      })
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
    } finally {
      setIsUploading(false)
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending' || f.status === 'error').length
  const hasFiles = files.length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {/* Aircraft — always visible, most important */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Aircraft</Label>
          <Select value={defaultAircraftSelection} onValueChange={setDefaultAircraftSelection}>
            <SelectTrigger className="h-9 text-sm">
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
        </div>

        {/* Quick-select category chips */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
            {defaultDocumentDetailSelection && (
              <button
                type="button"
                onClick={() => {
                  setDefaultDocumentDetailSelection('')
                  setDefaultDocumentGroupSelection(DOCUMENT_TAXONOMY_GROUPS[0]?.id ?? '__none__')
                  setClassificationSearch('')
                }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.detailId}
                type="button"
                onClick={() => {
                  setDefaultDocumentGroupSelection(chip.groupId)
                  setDefaultDocumentDetailSelection(chip.detailId)
                  setClassificationSearch('')
                }}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  defaultDocumentDetailSelection === chip.detailId
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-background text-muted-foreground border-border hover:border-brand-300 hover:text-foreground'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Skip this and we'll use AI to categorize from the file's contents.
          </p>
        </div>

        {/* Advanced options — collapsed by default */}
        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Advanced options
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-3">
              {/* Search */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Search document type</Label>
                <Input
                  value={classificationSearch}
                  onChange={(e) => setClassificationSearch(e.target.value)}
                  placeholder="Try: 100 hour, 337, weight and balance, service bulletin"
                  className="h-9 text-sm"
                />
                {classificationSearch.trim().length > 0 && (
                  <div className="rounded-lg border border-border bg-background p-2 space-y-1">
                    {classificationMatches.length > 0 ? (
                      classificationMatches.slice(0, 6).map((match) => (
                        <button
                          key={`${match.groupId}:${match.detailId}`}
                          type="button"
                          onClick={() => {
                            setDefaultDocumentGroupSelection(match.groupId)
                            setDefaultDocumentDetailSelection(match.detailId)
                            setClassificationSearch(match.detailLabel)
                          }}
                          className="w-full rounded-md border border-transparent px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
                        >
                          <p className="text-sm font-medium text-foreground">{match.detailLabel}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {match.groupLabel} · {match.profile.truthRole.replace(/_/g, ' ')}
                          </p>
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1 text-xs text-muted-foreground">
                        No close match yet. Keep typing a document name, form number, or inspection term.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Major document section</Label>
                  <Select value={defaultDocumentGroupSelection} onValueChange={setDefaultDocumentGroupSelection}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Choose major section" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TAXONOMY_GROUPS.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Exact document type</Label>
                  <Select value={defaultDocumentDetailSelection} onValueChange={setDefaultDocumentDetailSelection}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Choose exact document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {getDocumentItemsForGroup(defaultDocumentGroupSelection).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Subtype / volume (optional)</Label>
                <Input
                  value={defaultDocumentSubtypeSelection}
                  onChange={(e) => setDefaultDocumentSubtypeSelection(e.target.value)}
                  placeholder="e.g. Volume 2, Left engine, Revision C"
                  className="h-9 text-sm"
                />
              </div>

              {selectedClassificationProfile && (
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs">{selectedClassificationProfile.groupLabel}</Badge>
                    <Badge variant="secondary" className="text-xs">{selectedClassificationProfile.detailLabel}</Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {selectedClassificationProfile.truthRole.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {selectedClassificationProfile.parserStrategy.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Record family: {selectedClassificationProfile.recordFamily.replace(/_/g, ' ')} ·
                    Review priority: {selectedClassificationProfile.reviewPriority}
                    {selectedClassificationProfile.canActivateReminder ? ' · reminder relevant' : ''}
                    {selectedClassificationProfile.canSatisfyAdRequirement ? ' · AD evidence' : ''}
                  </p>
                </div>
              )}

              {hasFiles && (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={applyDefaultClassificationToPendingFiles}>
                    Apply current classification to pending files
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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

      {dropError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {dropError}
        </div>
      )}

      {/* File queue */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((item) => {
            const realtimeStatus = item.documentId ? parsingStatuses[item.documentId] : undefined
            const manual = isManualType(item.docType)
            const isPaid = item.manualAccess === 'paid'
            const needsAttestation = ['free', 'paid'].includes(item.manualAccess) && manual
            const uploaderShare = item.price ? (parseFloat(item.price) * 0.5).toFixed(2) : '0.00'
            const itemDetailOptions = getDocumentItemsForGroup(item.documentGroupId)
            const selectedDetail = getDocumentItem(item.documentDetailId)

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
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Document title</Label>
                      <Input
                        value={item.title}
                        onChange={(e) => updateFile(item.id, { title: e.target.value })}
                        placeholder="Document title (required)"
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* 2. Visibility toggle — Private / Shared with team */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Visibility</Label>
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
                    </div>

                    {/* 3. Aircraft */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Aircraft</Label>
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
                    </div>

                    {/* 4. Notes */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Notes</Label>
                      <Textarea
                        value={item.notes}
                        onChange={(e) => updateFile(item.id, { notes: e.target.value })}
                        placeholder="Notes (optional)"
                        className="text-xs min-h-[60px] resize-none"
                      />
                    </div>

                    {/* 5. Structured classification */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Major document section</Label>
                      <Select
                        value={item.documentGroupId ?? ''}
                        onValueChange={(val) => {
                          const nextItems = getDocumentItemsForGroup(val)
                          const nextDetail = nextItems[0]
                          updateFile(item.id, {
                            documentGroupId: val,
                            documentDetailId: nextDetail?.id,
                            docType: deriveDocTypeFromClassification(nextDetail?.id, item.docType),
                            manualAccess: 'private',
                            attestation: false,
                          })
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Choose major section" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TAXONOMY_GROUPS.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">Exact document type</Label>
                      <Select
                        value={item.documentDetailId ?? ''}
                        onValueChange={(val) =>
                          updateFile(item.id, {
                            documentDetailId: val,
                            docType: deriveDocTypeFromClassification(val, item.docType),
                            manualAccess: 'private',
                            attestation: false,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Choose exact document type" />
                        </SelectTrigger>
                        <SelectContent>
                          {itemDetailOptions.map((detail) => (
                            <SelectItem key={detail.id} value={detail.id}>
                              {detail.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedDetail && (
                        <p className="text-[11px] text-muted-foreground">
                          Stored as {DOC_TYPE_LABELS[selectedDetail.docType]} for compatibility.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">Subtype / volume</Label>
                        <Input
                          value={item.documentSubtype ?? ''}
                          onChange={(e) => updateFile(item.id, { documentSubtype: e.target.value })}
                          placeholder="e.g. Volume 1, Left engine"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">Document date</Label>
                        <Input
                          type="date"
                          value={item.documentDate ?? ''}
                          onChange={(e) => updateFile(item.id, { documentDate: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* 6. Book Assignment Type — non-manual types only */}
                    {!manual && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">Record timing</Label>
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
                      </div>
                    )}

                    {/* 7. Manual Access — manual types only */}
                    {manual && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-[11px] font-medium text-muted-foreground">Manual access</Label>
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
