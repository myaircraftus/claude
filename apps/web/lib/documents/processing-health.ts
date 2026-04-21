import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocumentProcessingState, ParsingStatus } from '@/types'
import {
  markDocumentProcessingFailed,
} from '@/lib/documents/processing-state'

export interface DocumentProcessingHealthRow {
  id: string
  title?: string | null
  parsing_status: ParsingStatus
  processing_state?: DocumentProcessingState | null
  parse_started_at?: string | null
  parse_completed_at?: string | null
  parse_error?: string | null
  updated_at?: string | null
  uploaded_at?: string | null
}

interface StaleProcessingDiagnosis {
  id: string
  nextStatus: 'failed'
  parseError: string
  parseCompletedAt: string
  updatedAt: string
}

const QUEUED_STALE_MS = 10 * 60 * 1000
const ACTIVE_STALE_MS = 20 * 60 * 1000

const ACTIVE_STATUSES: ParsingStatus[] = ['parsing', 'ocr_processing', 'chunking', 'embedding']
const RECONCILABLE_STATUSES: ParsingStatus[] = ['queued', ...ACTIVE_STATUSES]

function getTimestampMs(value?: string | null): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export function diagnoseStaleDocumentProcessing(
  row: DocumentProcessingHealthRow,
  now = Date.now()
): StaleProcessingDiagnosis | null {
  if (!RECONCILABLE_STATUSES.includes(row.parsing_status)) {
    return null
  }

  const queueReference = getTimestampMs(row.updated_at) ?? getTimestampMs(row.uploaded_at)
  const activeReference =
    getTimestampMs(row.parse_started_at) ??
    getTimestampMs(row.updated_at) ??
    getTimestampMs(row.uploaded_at)

  const nowIso = new Date(now).toISOString()

  if (row.parsing_status === 'queued') {
    if (row.parse_started_at) return null
    if (!queueReference || now - queueReference < QUEUED_STALE_MS) return null

    return {
      id: row.id,
      nextStatus: 'failed',
      parseError:
        'Background OCR/indexing never started. This job was marked failed so it can be retried safely.',
      parseCompletedAt: nowIso,
      updatedAt: nowIso,
    }
  }

  if (!activeReference || now - activeReference < ACTIVE_STALE_MS) {
    return null
  }

  return {
    id: row.id,
    nextStatus: 'failed',
    parseError:
      'OCR/indexing stopped making progress. This job was marked failed so it can be retried safely.',
    parseCompletedAt: nowIso,
    updatedAt: nowIso,
  }
}

export async function reconcileDocumentProcessingStates<T extends DocumentProcessingHealthRow>(
  serviceClient: SupabaseClient,
  rows: T[]
): Promise<T[]> {
  if (rows.length === 0) {
    return rows
  }

  const now = Date.now()
  const staleRows = rows
    .map((row) => ({ row, diagnosis: diagnoseStaleDocumentProcessing(row, now) }))
    .filter(
      (entry): entry is { row: T; diagnosis: StaleProcessingDiagnosis } =>
        Boolean(entry.diagnosis)
    )

  if (staleRows.length === 0) {
    return rows
  }

  await Promise.all(
    staleRows.map(async ({ row, diagnosis }) => {
      await serviceClient
        .from('documents')
        .update({
          parsing_status: diagnosis.nextStatus,
          processing_state: markDocumentProcessingFailed(
            row.processing_state,
            diagnosis.parseError,
            { now: diagnosis.updatedAt }
          ),
          parse_error: diagnosis.parseError,
          parse_completed_at: diagnosis.parseCompletedAt,
          updated_at: diagnosis.updatedAt,
        })
        .eq('id', diagnosis.id)
        .in('parsing_status', RECONCILABLE_STATUSES)
    })
  )

  const diagnosisById = new Map(staleRows.map(({ diagnosis }) => [diagnosis.id, diagnosis]))

  return rows.map((row) => {
    const diagnosis = diagnosisById.get(row.id)
    if (!diagnosis) return row

    return {
      ...row,
      parsing_status: diagnosis.nextStatus,
      processing_state: markDocumentProcessingFailed(
        row.processing_state,
        diagnosis.parseError,
        { now: diagnosis.updatedAt }
      ),
      parse_error: diagnosis.parseError,
      parse_completed_at: diagnosis.parseCompletedAt,
      updated_at: diagnosis.updatedAt,
    }
  })
}

export async function reconcileOrganizationStaleDocuments(
  serviceClient: SupabaseClient,
  organizationId: string
): Promise<void> {
  const { data, error } = await serviceClient
    .from('documents')
    .select('id, title, parsing_status, processing_state, parse_started_at, parse_completed_at, parse_error, updated_at, uploaded_at')
    .eq('organization_id', organizationId)
    .in('parsing_status', RECONCILABLE_STATUSES)

  if (error || !data?.length) {
    return
  }

  await reconcileDocumentProcessingStates(serviceClient, data as DocumentProcessingHealthRow[])
}
