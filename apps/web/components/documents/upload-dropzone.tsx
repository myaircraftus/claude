'use client'

import Link from '@/components/shared/tenant-link'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, CheckCircle2, AlertCircle, FileText, Loader2, Lock, Users, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { personaCanUpload, buildPersonaRejection } from '@/lib/documents/persona-scope'
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
import type {
  FileUploadItem,
  DocType,
  ParsingStatus,
  ManualAccess,
  BookAssignment,
  DocumentProcessingState,
} from '@/types'
import {
  buildInitialDocumentProcessingState,
  coerceDocumentProcessingState,
  DOCUMENT_PROCESSING_STAGE_ORDER,
  DOCUMENT_PROCESSING_STAGE_LABELS,
  getDocumentProcessingEngineLabel,
  getDocumentProcessingProgress,
} from '@/lib/documents/processing-state'
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

// Quick-select chips — two persona-specific sets
type QuickChip = { label: string; groupId: string; detailId: string }

const OWNER_CHIPS: QuickChip[] = [
  { label: 'Engine Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'engine_logbooks' },
  { label: 'Airframe Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'airframe_logbooks' },
  { label: 'Propeller Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'propeller_logbooks' },
  { label: 'Avionics Logbook', groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'avionics_logbooks' },
  { label: 'POH', groupId: 'flight_crew_and_operating_documents', detailId: 'pilot_s_operating_handbook_poh' },
  { label: 'Registration', groupId: 'legal_and_ownership', detailId: 'certificate_of_aircraft_registration' },
  { label: 'Airworthiness Cert', groupId: 'airworthiness_and_certification', detailId: 'standard_airworthiness_certificate' },
  { label: 'Weight & Balance', groupId: 'airworthiness_and_certification', detailId: 'weight_and_balance_report' },
  { label: 'Bill of Sale', groupId: 'legal_and_ownership', detailId: 'bill_of_sale' },
  { label: 'Insurance', groupId: 'insurance_finance_and_commercial_records', detailId: 'insurance_policies' },
  { label: 'AFM', groupId: 'flight_crew_and_operating_documents', detailId: 'airplane_flight_manual_afm' },
]

const MECHANIC_CHIPS: QuickChip[] = [
  { label: 'Maintenance Manual', groupId: 'maintenance_program_and_inspection_records', detailId: 'maintenance_manual' },
  { label: 'Parts Catalog / IPC', groupId: 'maintenance_program_and_inspection_records', detailId: 'illustrated_parts_catalog_ipc' },
  { label: 'Overhaul Manual', groupId: 'maintenance_program_and_inspection_records', detailId: 'overhaul_manual' },
  { label: 'Avionics Manual', groupId: 'avionics_and_electrical', detailId: 'avionics_manuals' },
  { label: 'Structural Repair Manual', groupId: 'maintenance_program_and_inspection_records', detailId: 'structural_repair_manual_srm' },
  { label: 'Service Bulletin', groupId: 'ad_sb_and_service_information', detailId: 'service_bulletins' },
  { label: 'AD Compliance', groupId: 'ad_sb_and_service_information', detailId: 'ad_compliance_records' },
  { label: 'Work Order Doc', groupId: 'work_orders_and_shop_records', detailId: 'maintenance_work_orders' },
  { label: 'FAA Form 337', groupId: 'airworthiness_and_certification', detailId: 'faa_form_337_records' },
  { label: 'TCDS', groupId: 'airworthiness_and_certification', detailId: 'type_certificate_data_sheet_tcds' },
]

const MAX_UPLOAD_FILE_SIZE_BYTES = 500 * 1024 * 1024
const COMPACT_STAGE_ORDER = DOCUMENT_PROCESSING_STAGE_ORDER.filter((stage) => stage !== 'ocr_fallback')
const COMPACT_STAGE_LABELS: Partial<Record<DocumentProcessingState['current_stage'], string>> = {
  uploaded: 'Uploaded',
  native_text_probe: 'PDF Probe',
  document_ai_ocr: 'OCR',
  field_extraction: 'Parse',
  chunking: 'Chunk',
  embedding: 'Embed',
  completed: 'Done',
}

function getCompactStageLabel(
  state: DocumentProcessingState | null | undefined,
  stage: DocumentProcessingState['current_stage']
) {
  const snapshot = state?.stages?.[stage]
  if (stage === 'document_ai_ocr' && snapshot?.status === 'skipped') {
    return 'OCR Skipped'
  }

  return COMPACT_STAGE_LABELS[stage] ?? DOCUMENT_PROCESSING_STAGE_LABELS[stage]
}

function getProcessingStateHint(state: DocumentProcessingState | null | undefined) {
  if (!state) return null

  if (state.stages?.document_ai_ocr?.status === 'skipped') {
    return 'Text layer detected, so Google Document AI OCR was skipped.'
  }

  if (state.current_stage === 'needs_review') {
    return 'Low-confidence or handwritten OCR content needs human review.'
  }

  return null
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
  suggested_document_categories?: string[] | null
}

interface UploadDropzoneProps {
  aircraftOptions: AircraftOption[]
  defaultAircraftId?: string
  defaultDocType?: DocType
  defaultDocumentGroupId?: string
  defaultDocumentDetailId?: string
  defaultDocumentSubtype?: string
  /** Controls which quick-select chip set is shown. Defaults to 'owner'. */
  persona?: 'owner' | 'mechanic'
}

type DocumentStatusRow = {
  id: string
  parsing_status: ParsingStatus
  processing_state?: DocumentProcessingState | null
  parse_error?: string | null
}

type RecentUploadItem = {
  id: string
  documentId: string
  fileName: string
  fileSize: number
  aircraftId?: string
  status: 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  processingState?: DocumentProcessingState | null
}

const RECENT_UPLOADS_STORAGE_KEY = 'documents_recent_uploads_v1'

function buildFileSignature(file: File) {
  return [file.name, file.size, file.lastModified].join('::')
}

function getPersistedOwnerAircraftId() {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem('owner_selected_aircraft_id')?.trim()
  return value ? value : undefined
}

function normalizeUploadErrorMessage(message: string) {
  const lowered = message.toLowerCase()
  if (
    lowered.includes('payload too large') ||
    lowered.includes('maximum allowed size') ||
    lowered.includes('object exceeded')
  ) {
    return 'Storage rejected this upload as too large. The app is configured for files up to 500 MB, so if you still see this it is coming from the active storage provider limit or transport path.'
  }

  return message
}

function readPersistedRecentUploads(): RecentUploadItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.sessionStorage.getItem(RECENT_UPLOADS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
        documentId: typeof item.documentId === 'string' ? item.documentId : '',
        fileName: typeof item.fileName === 'string' ? item.fileName : 'Uploaded document',
        fileSize: typeof item.fileSize === 'number' ? item.fileSize : 0,
        aircraftId: typeof item.aircraftId === 'string' ? item.aircraftId : undefined,
        status: (item.status === 'completed' || item.status === 'error'
          ? item.status
          : 'processing') as RecentUploadItem['status'],
        progress: typeof item.progress === 'number' ? item.progress : 0,
        error: typeof item.error === 'string' ? item.error : undefined,
        processingState: (item.processingState as DocumentProcessingState | null | undefined) ?? null,
      }))
      .filter((item) => Boolean(item.documentId))
      .slice(0, 20)
  } catch {
    return []
  }
}

function persistRecentUploads(items: RecentUploadItem[]) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(RECENT_UPLOADS_STORAGE_KEY, JSON.stringify(items.slice(0, 20)))
  } catch {
    // Best effort only.
  }
}

function reconcileFileWithDocumentRow(
  item: FileUploadItem,
  row: DocumentStatusRow
): FileUploadItem {
  const normalizedProcessingState = coerceDocumentProcessingState(row.processing_state, undefined, {
    status: row.parsing_status,
    parseError: row.parse_error ?? null,
  })
  const currentStage = normalizedProcessingState.current_stage
  const terminalReviewState = currentStage === 'needs_review' || row.parsing_status === 'needs_ocr'

  if (row.parsing_status === 'failed') {
    return {
      ...item,
      status: 'error',
      progress: getDocumentProcessingProgress(normalizedProcessingState, row.parsing_status),
      error:
        row.parse_error ??
        normalizedProcessingState.last_error ??
        item.error ??
        'Document processing failed after upload.',
      processingState: normalizedProcessingState,
    }
  }

  if (row.parsing_status === 'completed' || terminalReviewState) {
    return {
      ...item,
      status: 'completed',
      progress: 100,
      error: undefined,
      processingState: normalizedProcessingState,
    }
  }

  return {
    ...item,
    status: 'processing',
    progress: getDocumentProcessingProgress(normalizedProcessingState, row.parsing_status),
    error: row.parse_error ?? undefined,
    processingState: normalizedProcessingState,
  }
}

function reconcileRecentUploadWithDocumentRow(
  item: RecentUploadItem,
  row: DocumentStatusRow
): RecentUploadItem {
  const normalizedProcessingState = coerceDocumentProcessingState(row.processing_state, undefined, {
    status: row.parsing_status,
    parseError: row.parse_error ?? null,
  })
  const currentStage = normalizedProcessingState.current_stage
  const terminalReviewState = currentStage === 'needs_review' || row.parsing_status === 'needs_ocr'

  if (row.parsing_status === 'failed') {
    return {
      ...item,
      status: 'error',
      progress: getDocumentProcessingProgress(normalizedProcessingState, row.parsing_status),
      error:
        row.parse_error ??
        normalizedProcessingState.last_error ??
        item.error ??
        'Document processing failed after upload.',
      processingState: normalizedProcessingState,
    }
  }

  if (row.parsing_status === 'completed' || terminalReviewState) {
    return {
      ...item,
      status: 'completed',
      progress: 100,
      error: undefined,
      processingState: normalizedProcessingState,
    }
  }

  return {
    ...item,
    status: 'processing',
    progress: getDocumentProcessingProgress(normalizedProcessingState, row.parsing_status),
    error: row.parse_error ?? undefined,
    processingState: normalizedProcessingState,
  }
}

// ─── ProcessingStatusBadge ────────────────────────────────────────────────────

function ProcessingStatusBadge({
  status,
  currentStage,
}: {
  status: ParsingStatus
  currentStage?: DocumentProcessingState['current_stage'] | null
}) {
  if (currentStage === 'needs_review') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
        <AlertCircle className="w-3 h-3" />
        Needs Review
      </span>
    )
  }

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

function CompactProcessingTimeline({
  state,
  fallbackStatus,
}: {
  state: DocumentProcessingState | null | undefined
  fallbackStatus?: ParsingStatus
}) {
  const normalizedState = state
    ? state
    : coerceDocumentProcessingState(null, undefined, {
        status: fallbackStatus ?? 'queued',
      })
  const displayStages = [...COMPACT_STAGE_ORDER]
  if (
    normalizedState.current_stage === 'needs_review' ||
    normalizedState.current_stage === 'failed'
  ) {
    displayStages.push(normalizedState.current_stage)
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-start gap-1.5">
        {displayStages.map((stage, index) => {
          const snapshot = normalizedState.stages?.[stage]
          const inferredStatus =
            snapshot?.status ??
            (stage === normalizedState.current_stage ? 'running' : stage === 'uploaded' ? 'completed' : 'pending')
          const label = getCompactStageLabel(normalizedState, stage)

          const circleClass =
            inferredStatus === 'completed'
              ? 'border-green-600 bg-green-600 text-white'
              : inferredStatus === 'running'
                ? 'border-blue-600 bg-blue-600 text-white'
                : inferredStatus === 'failed'
                  ? 'border-red-600 bg-red-600 text-white'
                  : inferredStatus === 'skipped'
                    ? 'border-slate-300 bg-slate-100 text-slate-500'
                    : 'border-slate-300 bg-white text-slate-400'

          const textClass =
            inferredStatus === 'completed'
              ? 'text-green-700'
              : inferredStatus === 'running'
                ? 'text-blue-700'
                : inferredStatus === 'failed'
                  ? 'text-red-700'
                  : inferredStatus === 'skipped'
                    ? 'text-slate-500'
                    : 'text-slate-500'

          return (
            <div key={stage} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold',
                    circleClass
                  )}
                >
                  {inferredStatus === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : inferredStatus === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : inferredStatus === 'failed' ? (
                    <AlertCircle className="h-3.5 w-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={cn('text-[10px] font-medium whitespace-nowrap', textClass)}>{label}</span>
              </div>
              {index < COMPACT_STAGE_ORDER.length - 1 && (
                <div
                  className={cn(
                    'mb-4 h-0.5 w-6 rounded-full',
                    inferredStatus === 'completed' ? 'bg-green-400' : 'bg-slate-200'
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
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
  persona = 'owner',
}: UploadDropzoneProps) {
  const quickChips = persona === 'mechanic' ? MECHANIC_CHIPS : OWNER_CHIPS
  const chipSectionLabel =
    persona === 'mechanic'
      ? 'Manuals, catalogs, and compliance records'
      : 'Aircraft records & certificates'
  const [files, setFiles] = useState<FileUploadItem[]>([])
  const [recentUploads, setRecentUploads] = useState<RecentUploadItem[]>(() =>
    readPersistedRecentUploads()
  )
  const [isUploading, setIsUploading] = useState(false)
  const [parsingStatuses, setParsingStatuses] = useState<Record<string, ParsingStatus>>({})
  const [processingStates, setProcessingStates] = useState<Record<string, DocumentProcessingState | null>>({})
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
    () => [
      ...new Set(
        recentUploads
          .map((item) => item.documentId)
          .filter((documentId): documentId is string => Boolean(documentId))
      ),
    ],
    [recentUploads]
  )
  const documentIdsSignature = useMemo(
    () => trackedDocumentIds.join(','),
    [trackedDocumentIds]
  )
  const classificationMatches = useMemo(
    () => searchDocumentTaxonomy(deferredClassificationSearch),
    [deferredClassificationSearch]
  )
  const selectedAircraftOption = useMemo(
    () =>
      defaultAircraftSelection === '__none__'
        ? null
        : aircraftOptions.find((aircraft) => aircraft.id === defaultAircraftSelection) ?? null,
    [aircraftOptions, defaultAircraftSelection]
  )
  const suggestedCategoryMatches = useMemo(() => {
    const labels = selectedAircraftOption?.suggested_document_categories ?? []
    const seen = new Set<string>()

    return labels
      .map((label) => label.trim())
      .filter((label) => {
        if (!label) return false
        const key = label.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((label) => ({
        label,
        match: searchDocumentTaxonomy(label)[0] ?? null,
      }))
  }, [selectedAircraftOption])
  const selectedClassificationProfile = useMemo(
    () => getDocumentClassificationSummary(defaultDocumentDetailSelection),
    [defaultDocumentDetailSelection]
  )

  useEffect(() => {
    persistRecentUploads(recentUploads)
  }, [recentUploads])

  useEffect(() => {
    const processingItems = files.filter(
      (item) => item.documentId && (item.status === 'processing' || item.status === 'completed')
    )
    if (processingItems.length === 0) return

    setRecentUploads((prev) => {
      const next = [...prev]
      for (const item of processingItems) {
        const recentItem: RecentUploadItem = {
          id: item.id,
          documentId: item.documentId!,
          fileName: item.file.name,
          fileSize: item.file.size,
          aircraftId: item.aircraftId,
          status: item.status === 'completed' ? 'completed' : 'processing',
          progress: item.progress,
          error: item.error,
          processingState: item.processingState ?? null,
        }
        const existingIndex = next.findIndex((candidate) => candidate.documentId === recentItem.documentId)
        if (existingIndex >= 0) next[existingIndex] = recentItem
        else next.unshift(recentItem)
      }
      return next.slice(0, 20)
    })

    setFiles((prev) =>
      prev.filter(
        (item) => !(item.documentId && (item.status === 'processing' || item.status === 'completed'))
      )
    )
  }, [files])

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
          const doc = payload.new as {
            id: string
            parsing_status: ParsingStatus
            processing_state?: DocumentProcessingState | null
          }
          setParsingStatuses((prev) => ({ ...prev, [doc.id]: doc.parsing_status }))
          setProcessingStates((prev) => ({ ...prev, [doc.id]: doc.processing_state ?? null }))
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [documentIdsSignature, trackedDocumentIds])

  useEffect(() => {
    const docIds = documentIdsSignature ? documentIdsSignature.split(',').filter(Boolean) : []
    if (docIds.length === 0) return

    let cancelled = false

    const pollViaBrowserSupabase = async (): Promise<DocumentStatusRow[] | null> => {
      try {
        const supabase = createBrowserSupabase()
        const { data, error } = await supabase
          .from('documents')
          .select('id, parsing_status, processing_state, parse_error')
          .in('id', docIds)

        if (cancelled || error || !data) return null
        return data as DocumentStatusRow[]
      } catch {
        return null
      }
    }

    const poll = async () => {
      const params = new URLSearchParams()
      for (const id of docIds) params.append('id', id)

      let rows: DocumentStatusRow[] | null = null

      try {
        const response = await fetch(`/api/documents/status?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        })

        const payload = (await response.json().catch(() => ({}))) as {
          documents?: DocumentStatusRow[]
        }

        if (!cancelled && response.ok && payload.documents) {
          rows = payload.documents
        }
      } catch {
        // Fall through to browser-client query.
      }

      if (!rows || rows.length === 0) {
        rows = await pollViaBrowserSupabase()
      }

      if (cancelled || !rows) return

      const rowsById = new Map(rows.map((row) => [row.id, row]))

      setParsingStatuses((prev) => {
        const next = { ...prev }
        for (const row of rows) next[row.id] = row.parsing_status
        return next
      })

      setProcessingStates((prev) => {
        const next = { ...prev }
        for (const row of rows) next[row.id] = row.processing_state ?? null
        return next
      })

      setFiles((prev) =>
        prev.map((item) => {
          if (!item.documentId) return item
          const row = rowsById.get(item.documentId)
          if (!row) return item
          return reconcileFileWithDocumentRow(item, row)
        })
      )

      setRecentUploads((prev) =>
        prev.map((item) => {
          const row = rowsById.get(item.documentId)
          if (!row) return item
          return reconcileRecentUploadWithDocumentRow(item, row)
        })
      )
    }

    void poll()
    const interval = window.setInterval(() => {
      void poll()
    }, 2500)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [documentIdsSignature])

  useEffect(() => {
    if (Object.keys(parsingStatuses).length === 0) return

    setFiles((prev) =>
      prev.map((item) => {
        if (!item.documentId) return item

        const realtimeStatus = parsingStatuses[item.documentId]
        const realtimeProcessingState = processingStates[item.documentId]
        if (!realtimeStatus) return item
        if (
          item.status === 'completed' &&
          realtimeStatus !== 'completed' &&
          realtimeStatus !== 'failed' &&
          realtimeStatus !== 'needs_ocr'
        ) {
          return item
        }

        return reconcileFileWithDocumentRow(item, {
          id: item.documentId,
          parsing_status: realtimeStatus,
          processing_state: realtimeProcessingState ?? null,
          parse_error: item.error ?? null,
        })
      })
    )

    setRecentUploads((prev) =>
      prev.map((item) => {
        const realtimeStatus = parsingStatuses[item.documentId]
        const realtimeProcessingState = processingStates[item.documentId]
        if (!realtimeStatus) return item

        return reconcileRecentUploadWithDocumentRow(item, {
          id: item.documentId,
          parsing_status: realtimeStatus,
          processing_state: realtimeProcessingState ?? null,
          parse_error: item.error ?? null,
        })
      })
    )
  }, [parsingStatuses, processingStates])

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
    maxSize: MAX_UPLOAD_FILE_SIZE_BYTES,
    multiple: true,
    disabled: isUploading,
  })

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  function updateFile(id: string, patch: Partial<FileUploadItem>) {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function dismissRecentUpload(id: string) {
    setRecentUploads((prev) => prev.filter((item) => item.id !== id))
  }

  function applySuggestedCategory(label: string, match?: { groupId: string; detailId: string; detailLabel?: string } | null) {
    if (match) {
      setDefaultDocumentGroupSelection(match.groupId)
      setDefaultDocumentDetailSelection(match.detailId)
      setClassificationSearch(match.detailLabel ?? label)
      return
    }

    setClassificationSearch(label)
    setAdvancedOpen(true)
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

  async function uploadViaSignedUrl(
    item: FileUploadItem,
    signedUrl: string
  ) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', signedUrl)
      xhr.setRequestHeader('content-type', item.file.type || 'application/pdf')
      xhr.setRequestHeader('x-upsert', 'false')

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        const ratio = event.total > 0 ? event.loaded / event.total : 0
        updateFile(item.id, { progress: 15 + Math.round(ratio * 65) })
      }

      xhr.onerror = () => {
        reject(new Error('Network error while uploading file to storage.'))
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
          return
        }

        let message = `Failed to upload file to storage (${xhr.status}).`
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string; message?: string }
          message = parsed.error ?? parsed.message ?? message
        } catch {
          if (xhr.responseText?.trim()) {
            message = xhr.responseText.trim()
          }
        }
        reject(new Error(message))
      }

      xhr.send(item.file)
    })
  }

  async function kickOffDocumentProcessing(documentId: string, fileId: string, attempt = 1): Promise<void> {
    try {
      const response = await fetch(`/api/documents/${documentId}/retry`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        status?: string
        warning?: string | null
      }

      if (!response.ok || payload.status === 'failed') {
        if (attempt < 3) {
          window.setTimeout(() => {
            void kickOffDocumentProcessing(documentId, fileId, attempt + 1)
          }, attempt * 1500)
          return
        }

        updateFile(fileId, {
          status: 'error',
          progress: 0,
          error: normalizeUploadErrorMessage(
            payload.error ?? payload.warning ?? `Document processing failed (${response.status})`
          ),
        })
        setRecentUploads((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  status: 'error',
                  progress: 0,
                  error: normalizeUploadErrorMessage(
                    payload.error ?? payload.warning ?? `Document processing failed (${response.status})`
                  ),
                }
              : item
          )
        )
        return
      }

      updateFile(fileId, {
        status: 'processing',
        progress: getDocumentProcessingProgress(
          coerceDocumentProcessingState(null, undefined, {
            status: 'parsing',
            parseError: null,
          }),
          'parsing'
        ),
        processingState: coerceDocumentProcessingState(null, undefined, {
          status: 'parsing',
          parseError: null,
        }),
      })
      setRecentUploads((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: 'processing',
                progress: getDocumentProcessingProgress(
                  coerceDocumentProcessingState(null, undefined, {
                    status: 'parsing',
                    parseError: null,
                  }),
                  'parsing'
                ),
                processingState: coerceDocumentProcessingState(null, undefined, {
                  status: 'parsing',
                  parseError: null,
                }),
              }
            : item
        )
      )

      window.setTimeout(async () => {
        try {
          const supabase = createBrowserSupabase()
          const { data, error } = await supabase
            .from('documents')
            .select('parsing_status, processing_state, parse_error')
            .eq('id', documentId)
            .single()

          if (error || !data) return

          const processingState = coerceDocumentProcessingState(data.processing_state, undefined, {
            status: data.parsing_status,
            parseError: data.parse_error,
          })

          const stillQueued =
            data.parsing_status === 'queued' &&
            processingState.current_stage === 'uploaded'

          if (stillQueued && attempt < 3) {
            void kickOffDocumentProcessing(documentId, fileId, attempt + 1)
          }
        } catch {
          // Best effort only. Polling/realtime will reconcile state.
        }
      }, 3000)
    } catch (error) {
      if (attempt < 3) {
        window.setTimeout(() => {
          void kickOffDocumentProcessing(documentId, fileId, attempt + 1)
        }, attempt * 1500)
        return
      }

      updateFile(fileId, {
        status: 'error',
        progress: 0,
        error: normalizeUploadErrorMessage(
          error instanceof Error ? error.message : 'Failed to start document processing.'
        ),
      })
      setRecentUploads((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: 'error',
                progress: 0,
                error: normalizeUploadErrorMessage(
                  error instanceof Error ? error.message : 'Failed to start document processing.'
                ),
              }
            : item
        )
      )
    }
  }

  async function uploadFile(item: FileUploadItem): Promise<void> {
    // Client-side persona-scope pre-check: skip the round-trip to storage if
    // the user is on Mechanic persona and tries to upload an owner-only
    // doc type. Saves them a 350MB upload that we'd just reject server-side.
    if (!personaCanUpload(persona, item.docType)) {
      updateFile(item.id, {
        status: 'error',
        error: buildPersonaRejection(item.docType),
      })
      return
    }

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

      let uploadErrorMessage: string | null = null

      if (initPayload.signedUrl) {
        try {
          await uploadViaSignedUrl(item, initPayload.signedUrl)
        } catch (error) {
          uploadErrorMessage =
            error instanceof Error ? error.message : 'Failed to upload file to storage.'
        }
      }

      if (uploadErrorMessage) {
        const uploadPath = initPayload.signedPath ?? initPayload.storagePath
        const supabase = createBrowserSupabase()
        const { error: storageError } = await supabase.storage
          .from('documents')
          .uploadToSignedUrl(uploadPath, initPayload.uploadToken, item.file, {
            contentType: item.file.type || 'application/pdf',
          })

        if (storageError) {
          throw new Error(
            [uploadErrorMessage, storageError.message].filter(Boolean).join(' · ')
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
          // Send the active UI persona so the server can enforce the strict
          // scope rule: mechanics can't upload aircraft-specific records
          // (logbook, registration, work_order, etc.) — server rejects with
          // a clear PERSONA_SCOPE_BLOCKED error if the docType doesn't fit.
          persona,
        }),
      })

      const completePayload = (await completeResponse.json().catch(() => ({}))) as {
        error?: string
        document_id?: string
      }

      if (!completeResponse.ok || !completePayload.document_id) {
        throw new Error(completePayload.error || `Upload failed (${completeResponse.status})`)
      }
      const documentId: string = completePayload.document_id

      updateFile(item.id, {
        status: 'processing',
        progress: getDocumentProcessingProgress(buildInitialDocumentProcessingState(), 'queued'),
        documentId,
        error: undefined,
        processingState: buildInitialDocumentProcessingState(),
      })

      setRecentUploads((prev) =>
        [
          {
            id: item.id,
            documentId,
            fileName: item.file.name,
            fileSize: item.file.size,
            aircraftId: item.aircraftId,
            status: 'processing' as const,
            progress: getDocumentProcessingProgress(buildInitialDocumentProcessingState(), 'queued'),
            processingState: buildInitialDocumentProcessingState(),
          },
          ...prev.filter((candidate) => candidate.documentId !== documentId),
        ].slice(0, 20)
      )

      void kickOffDocumentProcessing(documentId, item.id)
    } catch (err) {
      updateFile(item.id, {
        status: 'error',
        progress: 0,
        error: normalizeUploadErrorMessage(err instanceof Error ? err.message : 'Unknown error'),
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
      // Run uploads with bounded concurrency. Each uploadFile() does:
      //   1. POST /api/upload/init    (small, fast)
      //   2. PUT to Supabase Storage  (network-bound, file size dependent)
      //   3. POST /api/upload/complete (small, returns immediately because
      //      ingestion is fire-and-forget on the server now)
      // Sequential was making "upload 11 logbooks" feel stuck — even though
      // step 3 returns fast now, we want network parallelism on step 2.
      const CONCURRENCY = 3
      const queue = [...pending]
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        // Each worker pulls the next pending item until the queue drains.
        // This way a slow upload can't block the others — a fresh worker
        // grabs the next file as soon as any worker frees up.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const item = queue.shift()
          if (!item) return
          try {
            await uploadFile(item)
          } catch (err) {
            console.error('[upload-dropzone] worker upload failed', err)
          }
        }
      })
      await Promise.all(workers)
    } finally {
      setIsUploading(false)
    }
  }

  const localQueueFiles = files.filter(
    (f) => f.status === 'pending' || f.status === 'uploading' || f.status === 'error'
  )
  const pendingCount = localQueueFiles.filter((f) => f.status === 'pending' || f.status === 'error').length
  const hasFiles = localQueueFiles.length > 0

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

        {suggestedCategoryMatches.length > 0 && selectedAircraftOption && (
          <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
            <div>
              <Label className="text-xs font-medium text-brand-700">
                AI suggestions for {selectedAircraftOption.tail_number}
              </Label>
              <p className="mt-0.5 text-[11px] text-brand-700/80">
                Based on this aircraft&apos;s operation profile, these are likely document categories to upload first.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedCategoryMatches.map(({ label, match }) => {
                const isActive = match ? defaultDocumentDetailSelection === match.detailId : classificationSearch === label
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applySuggestedCategory(label, match)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors',
                      isActive
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-brand-200 bg-white text-brand-700 hover:border-brand-400 hover:text-brand-900'
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick-select category chips */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Category</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">{chipSectionLabel}</p>
            </div>
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
            {quickChips.map((chip) => (
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
            Skip this and we&apos;ll use AI to categorize from the file&apos;s contents.
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
          {localQueueFiles.map((item) => {
            const realtimeStatus = item.documentId ? parsingStatuses[item.documentId] : undefined
            const manual = isManualType(item.docType)
            const isPaid = item.manualAccess === 'paid'
            const needsAttestation = ['free', 'paid'].includes(item.manualAccess) && manual
            const uploaderShare = item.price ? (parseFloat(item.price) * 0.5).toFixed(2) : '0.00'
            const itemDetailOptions = getDocumentItemsForGroup(item.documentGroupId)
            const selectedDetail = getDocumentItem(item.documentDetailId)
            const currentStageLabel = item.processingState
              ? getCompactStageLabel(item.processingState, item.processingState.current_stage)
              : null
            const currentEngineLabel = getDocumentProcessingEngineLabel(item.processingState?.current_engine)
            const batchLabel =
              item.processingState?.current_batch && item.processingState?.total_batches
                ? `Batch ${item.processingState.current_batch} of ${item.processingState.total_batches}`
                : null
            const processingHint = getProcessingStateHint(item.processingState)

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
                    {item.status === 'processing' && currentStageLabel && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {currentStageLabel}
                        {currentEngineLabel ? ` · ${currentEngineLabel}` : ''}
                        {batchLabel ? ` · ${batchLabel}` : ''}
                      </p>
                    )}
                    {processingHint && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {processingHint}
                      </p>
                    )}
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
                      <ProcessingStatusBadge
                        status={realtimeStatus}
                        currentStage={item.processingState?.current_stage ?? null}
                      />
                    )}
                    {item.status === 'processing' && !realtimeStatus && (
                      <ProcessingStatusBadge
                        status="queued"
                        currentStage={item.processingState?.current_stage ?? null}
                      />
                    )}
                    {item.status === 'completed' && (
                      <ProcessingStatusBadge
                        status="completed"
                        currentStage={item.processingState?.current_stage ?? null}
                      />
                    )}
                    {item.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {item.error ?? 'Error'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Retry button for failed items.
                        - If the doc already has a documentId (upload + DB
                          insert succeeded but ingestion later threw — e.g.
                          OpenAI 429), we POST to /api/documents/[id]/retry
                          and re-run the inline pipeline. No re-upload needed.
                        - Otherwise the upload itself never reached the server,
                          so we just flip status back to 'pending' and let the
                          user click "Re-upload all" or run uploadFile directly. */}
                    {item.status === 'error' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (item.documentId) {
                            updateFile(item.id, { status: 'processing', error: undefined, progress: 5 })
                            try {
                              const res = await fetch(`/api/documents/${item.documentId}/retry`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ force: true }),
                              })
                              if (!res.ok) {
                                const payload = await res.json().catch(() => ({}))
                                throw new Error(payload?.error ?? `Retry failed (${res.status})`)
                              }
                              updateFile(item.id, { progress: 100 })
                            } catch (err) {
                              updateFile(item.id, {
                                status: 'error',
                                error: err instanceof Error ? err.message : 'Retry failed',
                              })
                            }
                          } else {
                            // Never made it to the server — try the whole upload again
                            updateFile(item.id, { status: 'pending', error: undefined, progress: 0 })
                            void uploadFile({ ...item, status: 'pending', error: undefined, progress: 0 })
                          }
                        }}
                        className="text-xs text-primary hover:text-primary/80 font-medium"
                      >
                        Retry
                      </button>
                    )}
                    {item.status !== 'uploading' && (
                      <button
                        type="button"
                        onClick={() => removeFile(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
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

      {recentUploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Processing & recent uploads</h3>
              <p className="text-xs text-muted-foreground">
                Live status from the saved document rows. This section survives refresh.
              </p>
            </div>
            {/* Bulk retry — tops-up the OpenAI quota then click once to retry
                every failed doc instead of clicking each Retry button. */}
            {recentUploads.some((r) => r.status === 'error' && r.documentId) && (
              <button
                type="button"
                onClick={async () => {
                  const targets = recentUploads.filter((r) => r.status === 'error' && r.documentId)
                  // Optimistically flip them all to processing so the user sees progress
                  setRecentUploads((prev) =>
                    prev.map((r) =>
                      targets.find((t) => t.id === r.id)
                        ? { ...r, status: 'processing', error: undefined, progress: 5 }
                        : r,
                    ),
                  )
                  await Promise.all(
                    targets.map(async (r) => {
                      try {
                        const res = await fetch(`/api/documents/${r.documentId}/retry`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ force: true }),
                        })
                        if (!res.ok) {
                          const payload = await res.json().catch(() => ({}))
                          throw new Error(payload?.error ?? `Retry failed (${res.status})`)
                        }
                      } catch (err) {
                        setRecentUploads((prev) =>
                          prev.map((rr) =>
                            rr.id === r.id
                              ? {
                                  ...rr,
                                  status: 'error',
                                  error: err instanceof Error ? err.message : 'Retry failed',
                                }
                              : rr,
                          ),
                        )
                      }
                    }),
                  )
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs hover:bg-primary/90 transition-colors flex-shrink-0"
                style={{ fontWeight: 500 }}
              >
                <RefreshCw className="h-3 w-3" />
                Retry all failed (
                {recentUploads.filter((r) => r.status === 'error' && r.documentId).length}
                )
              </button>
            )}
          </div>
          {recentUploads.map((item) => {
            const realtimeStatus = parsingStatuses[item.documentId]
            const currentStageLabel = item.processingState
              ? getCompactStageLabel(item.processingState, item.processingState.current_stage)
              : null
            const currentEngineLabel = getDocumentProcessingEngineLabel(item.processingState?.current_engine)
            const batchLabel =
              item.processingState?.current_batch && item.processingState?.total_batches
                ? `Batch ${item.processingState.current_batch} of ${item.processingState.total_batches}`
                : null
            const processingHint = getProcessingStateHint(item.processingState)

            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-red-50">
                    <FileText className="h-4 w-4 text-red-500" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(item.fileSize)}</p>
                    {(item.status === 'processing' || item.status === 'completed') && currentStageLabel && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {currentStageLabel}
                        {currentEngineLabel ? ` · ${currentEngineLabel}` : ''}
                        {batchLabel ? ` · ${batchLabel}` : ''}
                      </p>
                    )}
                    {processingHint && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {processingHint}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {item.status === 'processing' && (
                      <ProcessingStatusBadge
                        status={realtimeStatus ?? 'queued'}
                        currentStage={item.processingState?.current_stage ?? null}
                      />
                    )}
                    {item.status === 'completed' && (
                      <ProcessingStatusBadge
                        status="completed"
                        currentStage={item.processingState?.current_stage ?? null}
                      />
                    )}
                    {item.status === 'error' && (
                      <div className="flex flex-col items-end gap-1">
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {item.error ?? 'Error'}
                        </span>
                        {/* Retry pulls from /api/documents/[id]/retry which
                            re-runs ingestion in place — no re-upload needed.
                            Useful when ingestion failed mid-pipeline (e.g.
                            OpenAI 429 quota) and the user resolved the
                            underlying cause but doesn't want to re-upload
                            a 350MB PDF. */}
                        <button
                          type="button"
                          onClick={async () => {
                            setRecentUploads((prev) =>
                              prev.map((r) =>
                                r.id === item.id
                                  ? { ...r, status: 'processing', error: undefined, progress: 5 }
                                  : r,
                              ),
                            )
                            try {
                              const res = await fetch(
                                `/api/documents/${item.documentId}/retry`,
                                {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ force: true }),
                                },
                              )
                              if (!res.ok) {
                                const payload = await res.json().catch(() => ({}))
                                throw new Error(payload?.error ?? `Retry failed (${res.status})`)
                              }
                              // Status will be picked up by the live polling
                              // hook on the next tick — no manual update needed.
                            } catch (err) {
                              setRecentUploads((prev) =>
                                prev.map((r) =>
                                  r.id === item.id
                                    ? {
                                        ...r,
                                        status: 'error',
                                        error: err instanceof Error ? err.message : 'Retry failed',
                                      }
                                    : r,
                                ),
                              )
                            }
                          }}
                          className="text-xs text-primary hover:text-primary/80 font-medium"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => dismissRecentUpload(item.id)}
                    className="flex-shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="pl-11 space-y-2">
                  <Progress value={item.progress} className="h-1.5" />
                  <CompactProcessingTimeline
                    state={item.processingState}
                    fallbackStatus={realtimeStatus ?? (item.status === 'completed' ? 'completed' : 'queued')}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {currentStageLabel ?? (item.status === 'completed' ? 'Indexed' : 'Processing')}
                    {currentEngineLabel ? ` · ${currentEngineLabel}` : ''}
                    {batchLabel ? ` · ${batchLabel}` : ''}
                  </p>
                  {item.processingState?.current_stage === 'needs_review' && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-amber-700">
                        Low-confidence or handwritten OCR content needs human review.
                      </span>
                      <Link
                        href={`/documents/review?documentId=${encodeURIComponent(item.documentId)}`}
                        className="font-medium text-brand-700 hover:text-brand-900"
                      >
                        Open review queue
                      </Link>
                    </div>
                  )}
                </div>
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
