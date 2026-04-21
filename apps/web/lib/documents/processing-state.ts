import type {
  DocumentProcessingStage,
  DocumentProcessingStageSnapshot,
  DocumentProcessingStageStatus,
  DocumentProcessingState,
  ParsingStatus,
} from '@/types'

export const DOCUMENT_PROCESSING_STAGE_ORDER: DocumentProcessingStage[] = [
  'uploaded',
  'native_text_probe',
  'document_ai_ocr',
  'ocr_fallback',
  'field_extraction',
  'chunking',
  'embedding',
  'completed',
]

export const DOCUMENT_PROCESSING_STAGE_LABELS: Record<DocumentProcessingStage, string> = {
  uploaded: 'Uploaded',
  native_text_probe: 'PDF.js Native Text Probe',
  document_ai_ocr: 'Google Document AI OCR',
  ocr_fallback: 'OCR Fallback',
  field_extraction: 'Field Extraction',
  chunking: 'Chunking',
  embedding: 'Embedding',
  completed: 'Indexed',
  needs_review: 'Needs Review',
  failed: 'Failed',
}

export const DOCUMENT_PROCESSING_ENGINE_LABELS: Record<string, string> = {
  pdfjs: 'PDF.js',
  google_document_ai: 'Google Document AI',
  local_tesseract: 'Local OCR',
  openai_pdf_ocr: 'OpenAI PDF OCR',
  aws_textract: 'AWS Textract',
  openai_embeddings: 'OpenAI Embeddings',
  parser_service: 'External Parser',
}

type LegacyProcessingFallback = {
  status?: ParsingStatus | null
  pageCount?: number | null
  parseError?: string | null
  ocrRequired?: boolean | null
  isTextNative?: boolean | null
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function coerceStageSnapshot(value: unknown): DocumentProcessingStageSnapshot | undefined {
  if (!isObjectLike(value) || typeof value.status !== 'string') return undefined

  return {
    status: value.status as DocumentProcessingStageStatus,
    engine: typeof value.engine === 'string' ? value.engine : null,
    started_at: typeof value.started_at === 'string' ? value.started_at : null,
    completed_at: typeof value.completed_at === 'string' ? value.completed_at : null,
    message: typeof value.message === 'string' ? value.message : null,
    current_batch:
      typeof value.current_batch === 'number' && Number.isFinite(value.current_batch)
        ? value.current_batch
        : null,
    total_batches:
      typeof value.total_batches === 'number' && Number.isFinite(value.total_batches)
        ? value.total_batches
        : null,
    page_count:
      typeof value.page_count === 'number' && Number.isFinite(value.page_count)
        ? value.page_count
        : null,
  }
}

export function buildInitialDocumentProcessingState(timestamp = new Date().toISOString()): DocumentProcessingState {
  return {
    current_stage: 'uploaded',
    current_engine: null,
    page_count: null,
    current_batch: null,
    total_batches: null,
    last_error: null,
    started_at: timestamp,
    updated_at: timestamp,
    stages: {
      uploaded: {
        status: 'completed',
        started_at: timestamp,
        completed_at: timestamp,
      },
    },
  }
}

export function coerceDocumentProcessingState(
  value: unknown,
  uploadedAt?: string | null,
  fallback?: LegacyProcessingFallback
): DocumentProcessingState {
  const base = buildInitialDocumentProcessingState(uploadedAt ?? new Date().toISOString())

  const deriveFromLegacy = () => {
    if (!fallback?.status) return base

    const now = uploadedAt ?? new Date().toISOString()
    const scanned = fallback.ocrRequired === true || fallback.isTextNative === false
    let derived = base

    const complete = (
      stage: DocumentProcessingStage,
      options: StageMutationOptions = {}
    ) => {
      derived = markDocumentProcessingStage(derived, stage, 'completed', { now, ...options })
    }
    const run = (
      stage: DocumentProcessingStage,
      options: StageMutationOptions = {}
    ) => {
      derived = markDocumentProcessingStage(derived, stage, 'running', { now, ...options })
    }

    complete('uploaded')

    switch (fallback.status) {
      case 'queued':
        break
      case 'parsing':
        run('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        break
      case 'ocr_processing':
        complete('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        run('document_ai_ocr', {
          engine: 'google_document_ai',
          pageCount: fallback.pageCount ?? null,
        })
        break
      case 'chunking':
        complete('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        if (scanned) {
          complete('document_ai_ocr', {
            engine: 'google_document_ai',
            pageCount: fallback.pageCount ?? null,
          })
        }
        complete('field_extraction', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        run('chunking', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        break
      case 'embedding':
        complete('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        if (scanned) {
          complete('document_ai_ocr', {
            engine: 'google_document_ai',
            pageCount: fallback.pageCount ?? null,
          })
        }
        complete('field_extraction', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        complete('chunking', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        run('embedding', {
          engine: 'openai_embeddings',
          pageCount: fallback.pageCount ?? null,
        })
        break
      case 'completed':
        complete('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        if (scanned) {
          complete('document_ai_ocr', {
            engine: 'google_document_ai',
            pageCount: fallback.pageCount ?? null,
          })
        }
        complete('field_extraction', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        complete('chunking', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        complete('embedding', {
          engine: 'openai_embeddings',
          pageCount: fallback.pageCount ?? null,
        })
        complete('completed', {
          engine: scanned ? 'google_document_ai' : 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        break
      case 'needs_ocr':
        complete('native_text_probe', {
          engine: 'pdfjs',
          pageCount: fallback.pageCount ?? null,
        })
        derived = markDocumentProcessingNeedsReview(
          derived,
          fallback.parseError ?? 'OCR review required before indexing can continue.',
          {
            now,
            pageCount: fallback.pageCount ?? null,
          }
        )
        break
      case 'failed':
      default:
        derived = markDocumentProcessingFailed(
          derived,
          fallback.parseError ?? 'Document processing failed.',
          {
            now,
            pageCount: fallback.pageCount ?? null,
          }
        )
        break
    }

    return derived
  }

  if (!isObjectLike(value)) return deriveFromLegacy()

  const hasStructuredState =
    typeof value.current_stage === 'string' ||
    (isObjectLike(value.stages) && Object.keys(value.stages).length > 0)
  if (!hasStructuredState) return deriveFromLegacy()

  const rawStages = isObjectLike(value.stages) ? value.stages : {}
  const stages: Partial<Record<DocumentProcessingStage, DocumentProcessingStageSnapshot>> = {
    ...base.stages,
  }

  for (const stage of Object.keys(rawStages) as DocumentProcessingStage[]) {
    const snapshot = coerceStageSnapshot(rawStages[stage])
    if (snapshot) {
      stages[stage] = snapshot
    }
  }

  return {
    current_stage:
      typeof value.current_stage === 'string'
        ? (value.current_stage as DocumentProcessingStage)
        : base.current_stage,
    current_engine: typeof value.current_engine === 'string' ? value.current_engine : null,
    page_count:
      typeof value.page_count === 'number' && Number.isFinite(value.page_count)
        ? value.page_count
        : fallback?.pageCount ?? null,
    current_batch:
      typeof value.current_batch === 'number' && Number.isFinite(value.current_batch)
        ? value.current_batch
        : null,
    total_batches:
      typeof value.total_batches === 'number' && Number.isFinite(value.total_batches)
        ? value.total_batches
        : null,
    last_error:
      typeof value.last_error === 'string'
        ? value.last_error
        : fallback?.parseError ?? null,
    started_at: typeof value.started_at === 'string' ? value.started_at : base.started_at,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : base.updated_at,
    stages,
  }
}

type StageMutationOptions = {
  engine?: string | null
  now?: string
  message?: string | null
  pageCount?: number | null
  currentBatch?: number | null
  totalBatches?: number | null
}

function updateStageSnapshot(
  previous: DocumentProcessingStageSnapshot | undefined,
  status: DocumentProcessingStageStatus,
  options: StageMutationOptions
): DocumentProcessingStageSnapshot {
  const now = options.now ?? new Date().toISOString()

  return {
    status,
    engine: options.engine ?? previous?.engine ?? null,
    started_at:
      status === 'running'
        ? previous?.started_at ?? now
        : previous?.started_at ?? (status === 'completed' || status === 'failed' ? now : null),
    completed_at:
      status === 'completed' || status === 'failed' || status === 'skipped'
        ? now
        : previous?.completed_at ?? null,
    message: options.message ?? previous?.message ?? null,
    page_count: options.pageCount ?? previous?.page_count ?? null,
    current_batch: options.currentBatch ?? previous?.current_batch ?? null,
    total_batches: options.totalBatches ?? previous?.total_batches ?? null,
  }
}

export function markDocumentProcessingStage(
  value: DocumentProcessingState | null | undefined,
  stage: DocumentProcessingStage,
  status: DocumentProcessingStageStatus,
  options: StageMutationOptions = {}
): DocumentProcessingState {
  const now = options.now ?? new Date().toISOString()
  const next = coerceDocumentProcessingState(value, now)
  const previous = next.stages?.[stage]
  const stageSnapshot = updateStageSnapshot(previous, status, { ...options, now })

  const stages = {
    ...(next.stages ?? {}),
    [stage]: stageSnapshot,
  }

  const terminalStage = stage === 'failed' || stage === 'needs_review'
  const currentStage =
    status === 'failed' || terminalStage
      ? stage
      : stage === 'completed' && status === 'completed'
      ? 'completed'
      : status === 'running'
      ? stage
      : next.current_stage

  return {
    ...next,
    current_stage: currentStage,
    current_engine: options.engine ?? next.current_engine ?? null,
    page_count: options.pageCount ?? next.page_count ?? null,
    current_batch: options.currentBatch ?? next.current_batch ?? null,
    total_batches: options.totalBatches ?? next.total_batches ?? null,
    last_error: status === 'failed' ? options.message ?? next.last_error ?? null : null,
    updated_at: now,
    stages,
  }
}

export function markDocumentProcessingCompleted(
  value: DocumentProcessingState | null | undefined,
  options: StageMutationOptions = {}
): DocumentProcessingState {
  return markDocumentProcessingStage(value, 'completed', 'completed', options)
}

export function markDocumentProcessingFailed(
  value: DocumentProcessingState | null | undefined,
  errorMessage: string,
  options: StageMutationOptions = {}
): DocumentProcessingState {
  return markDocumentProcessingStage(value, 'failed', 'failed', {
    ...options,
    message: errorMessage,
  })
}

export function markDocumentProcessingNeedsReview(
  value: DocumentProcessingState | null | undefined,
  message: string,
  options: StageMutationOptions = {}
): DocumentProcessingState {
  return markDocumentProcessingStage(value, 'needs_review', 'completed', {
    ...options,
    message,
  })
}

export function deriveLegacyProcessingStage(status: ParsingStatus): DocumentProcessingStage {
  switch (status) {
    case 'queued':
      return 'uploaded'
    case 'parsing':
      return 'native_text_probe'
    case 'ocr_processing':
      return 'document_ai_ocr'
    case 'chunking':
      return 'chunking'
    case 'embedding':
      return 'embedding'
    case 'completed':
      return 'completed'
    case 'needs_ocr':
      return 'needs_review'
    case 'failed':
    default:
      return 'failed'
  }
}

export function getDocumentProcessingProgress(
  state: DocumentProcessingState | null | undefined,
  fallbackStatus?: ParsingStatus | null
): number {
  if (!state) {
    switch (fallbackStatus) {
      case 'completed':
        return 100
      case 'embedding':
        return 90
      case 'chunking':
        return 75
      case 'ocr_processing':
      case 'parsing':
        return 45
      case 'queued':
        return 10
      case 'needs_ocr':
        return 95
      case 'failed':
      default:
        return 0
    }
  }

  const stage = state.current_stage
  if (stage === 'completed' || stage === 'needs_review') return 100
  if (stage === 'failed') {
    const lastSuccessfulIndex = [...DOCUMENT_PROCESSING_STAGE_ORDER]
      .reverse()
      .findIndex((candidate) => state.stages?.[candidate]?.status === 'completed')
    if (lastSuccessfulIndex === -1) return 0
    const index = DOCUMENT_PROCESSING_STAGE_ORDER.length - lastSuccessfulIndex - 1
    return Math.max(5, Math.round(((index + 1) / DOCUMENT_PROCESSING_STAGE_ORDER.length) * 100))
  }

  const index = DOCUMENT_PROCESSING_STAGE_ORDER.indexOf(stage)
  if (index === -1) return 0

  const base = Math.round((index / DOCUMENT_PROCESSING_STAGE_ORDER.length) * 100)
  const batchFraction =
    state.current_batch && state.total_batches && state.total_batches > 0
      ? state.current_batch / state.total_batches
      : 0

  const stageSpan = Math.round(100 / DOCUMENT_PROCESSING_STAGE_ORDER.length)
  return Math.min(99, base + Math.round(stageSpan * batchFraction))
}

export function getDocumentProcessingEngineLabel(engine?: string | null) {
  if (!engine) return null
  return DOCUMENT_PROCESSING_ENGINE_LABELS[engine] ?? engine
}
