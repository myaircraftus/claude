import { tasks } from '@trigger.dev/sdk/v3'
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import { buildOcrEntrySegments } from '@/lib/ocr/segments'
import { validateOcrField } from '@/lib/ocr/validation'
import { recordDocumentDriftSnapshot } from '@/lib/intelligence/quality'
import { ensureTriggerSecretKey, isTriggerConfigured } from '@/lib/ingestion/trigger-env'
import {
  extractMetadataInline,
  getUsableParserServiceUrl,
  type NativeExtractedEvent,
  type NativePageGeometryRegion,
  OcrNotConfiguredError,
  parseScannedPdfWithFallbacks,
  parseTextNativePdf,
} from '@/lib/ingestion/native-pdf'

interface DocumentRecord {
  id: string
  file_path: string
  organization_id: string
  aircraft_id: string | null
  doc_type: string
  book_id?: string | null
  book_number?: string | null
  book_type?: string | null
  book_assignment?: string | null
  scan_batch_id?: string | null
  document_group_id?: string | null
  document_detail_id?: string | null
  document_subtype?: string | null
  record_family?: string | null
  document_class?: string | null
  truth_role?: string | null
  parser_strategy?: string | null
  review_priority?: string | null
  canonical_eligibility?: boolean | null
  reminder_relevance?: boolean | null
  ad_relevance?: boolean | null
  inspection_relevance?: boolean | null
  completeness_relevance?: boolean | null
  intelligence_tags?: string[] | null
  title: string
  file_name: string
  mime_type: string
  page_count?: number | null
}

interface AircraftRecord {
  make: string | null
  model: string | null
  tail_number: string | null
}

interface ParsedPage {
  page_number: number
  text: string
  ocr_confidence?: number
  word_count?: number
  char_count?: number
  ocr_engine?: string | null
  is_ocr?: boolean
  page_classification?: string | null
  extracted_event?: NativeExtractedEvent | null
  geometry_regions?: NativePageGeometryRegion[]
}

interface ParsedChunk {
  chunk_index: number
  page_number: number
  page_number_end?: number
  section_title?: string
  text_for_embedding?: string
  display_text?: string
  token_count?: number
}

interface IngestResponse {
  is_text_native: boolean
  page_count: number
  pages: ParsedPage[]
  chunks: ParsedChunk[]
}

interface MetadataEvent {
  date?: string
  type?: string
  description?: string
  mechanic?: string
  airframe_tt?: string
  ad_reference?: string
}

interface MetadataResponse {
  metadata?: {
    logbook?: {
      maintenance_events?: MetadataEvent[]
    }
    [key: string]: unknown
  }
}

export interface DocumentIngestionResult {
  mode: 'trigger' | 'inline' | 'queued'
  status: 'queued' | 'completed' | 'needs_ocr' | 'failed'
  warning?: string
}

type ServiceClient = ReturnType<typeof createServiceSupabase>

type InsertedSegmentRow = {
  id: string
  ocr_page_job_id: string
  page_number: number
  segment_index: number
  segment_group_key: string
  evidence_state: string
  canonical_candidate: boolean
  segment_type: string
  confidence: number | null
  metadata_json?: Record<string, unknown> | null
}

function getParserHeaders() {
  const internalSecret = process.env.PARSER_SERVICE_SECRET ?? process.env.INTERNAL_SECRET
  return {
    'Content-Type': 'application/json',
    ...(internalSecret ? { 'X-Internal-Secret': internalSecret } : {}),
  }
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error ? String(error.message ?? '') : ''
  return new RegExp(`column .*${columnName}`, 'i').test(message)
}

async function batchInsert<T extends Record<string, unknown>>(
  supabase: ServiceClient,
  table: string,
  rows: T[],
  batchSize = 50
) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    const { error } = await supabase.from(table).insert(batch)
    if (error) {
      throw new Error(`Failed to insert into ${table}: ${error.message}`)
    }
  }
}

function omitKeys<T extends Record<string, unknown>>(row: T, keys: Set<string>) {
  if (keys.size === 0) return row

  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !keys.has(key))
  ) as T
}

async function insertOcrPageJobsCompat(
  supabase: ServiceClient,
  rows: Array<Record<string, unknown>>,
  batchSize = 50
) {
  const omittedColumns = new Set<string>()
  const optionalColumns = [
    'arbitration_status',
    'arbitration_confidence',
    'arbitration_reasoning',
    'engines_run',
  ]

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)

    while (true) {
      const payload = batch.map((row) => omitKeys(row, omittedColumns))
      const { error } = await supabase.from('ocr_page_jobs').insert(payload)

      if (!error) break

      const missingColumn = optionalColumns.find(
        (column) => !omittedColumns.has(column) && isMissingColumnError(error, column)
      )

      if (missingColumn) {
        omittedColumns.add(missingColumn)
        continue
      }

      throw new Error(`Failed to insert into ocr_page_jobs: ${error.message}`)
    }
  }

  return omittedColumns
}

async function fetchDocumentRecord(supabase: ServiceClient, documentId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select(`
      id,
      file_path,
      organization_id,
      aircraft_id,
      doc_type,
      book_id,
      book_number,
      book_type,
      book_assignment,
      scan_batch_id,
      document_group_id,
      document_detail_id,
      document_subtype,
      record_family,
      document_class,
      truth_role,
      parser_strategy,
      review_priority,
      canonical_eligibility,
      reminder_relevance,
      ad_relevance,
      inspection_relevance,
      completeness_relevance,
      intelligence_tags,
      title,
      file_name,
      mime_type
    `)
    .eq('id', documentId)
    .single()

  const document = (data as DocumentRecord | null) ?? null

  if (error || !document) {
    throw new Error(`Document not found: ${documentId}`)
  }

  let aircraft: AircraftRecord | null = null
  if (document.aircraft_id) {
    const { data } = await supabase
      .from('aircraft')
      .select('make, model, tail_number')
      .eq('id', document.aircraft_id)
      .maybeSingle()

    aircraft = (data as AircraftRecord | null) ?? null
  }

  return { document, aircraft }
}

async function clearDerivedArtifacts(supabase: ServiceClient, documentId: string) {
  try {
    const { data: pageJobs } = await supabase
      .from('ocr_page_jobs')
      .select('id')
      .eq('document_id', documentId)

    const pageJobIds = (pageJobs as Array<{ id: string }> | null)?.map((page) => page.id) ?? []

    if (pageJobIds.length > 0) {
      const { data: extractedEvents } = await supabase
        .from('ocr_extracted_events')
        .select('id')
        .in('ocr_page_job_id', pageJobIds)

      const extractedEventIds =
        (extractedEvents as Array<{ id: string }> | null)?.map((event) => event.id) ?? []

      if (extractedEventIds.length > 0) {
        await supabase.from('review_queue_items').delete().in('ocr_extracted_event_id', extractedEventIds)
      }

      await supabase.from('review_queue_items').delete().in('ocr_page_job_id', pageJobIds)
      await supabase.from('ocr_extracted_events').delete().in('ocr_page_job_id', pageJobIds)
      await supabase.from('ocr_page_jobs').delete().eq('document_id', documentId)
    }
  } catch (error) {
    console.warn('[ingestion] failed to clear OCR artifacts', error)
  }

  await supabase.from('document_metadata_extractions').delete().eq('document_id', documentId)
  await supabase.from('maintenance_events').delete().eq('document_id', documentId)
  await supabase.from('document_pages').delete().eq('document_id', documentId)
  await supabase.from('canonical_document_embeddings').delete().eq('document_id', documentId)
  await supabase.from('canonical_document_chunks').delete().eq('document_id', documentId)
  await supabase.from('document_chunks').delete().eq('document_id', documentId)
}

async function createSignedDocumentUrl(supabase: ServiceClient, filePath: string) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 3600)
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to generate signed URL: ${error?.message ?? 'no URL returned'}`)
  }
  return data.signedUrl
}

async function callParserIngest(args: {
  document: DocumentRecord
  aircraft: AircraftRecord | null
  fileUrl: string
}): Promise<IngestResponse> {
  const parserServiceUrl = getUsableParserServiceUrl()
  if (!parserServiceUrl) {
    throw new Error('PARSER_SERVICE_URL environment variable is required')
  }

  const response = await fetch(`${parserServiceUrl}/ingest`, {
    method: 'POST',
    headers: getParserHeaders(),
    body: JSON.stringify({
      document_id: args.document.id,
      file_url: args.fileUrl,
      org_id: args.document.organization_id,
      aircraft_id: args.document.aircraft_id,
      doc_type: args.document.doc_type,
      title: args.document.title,
      make: args.aircraft?.make ?? undefined,
      model: args.aircraft?.model ?? undefined,
    }),
  })

  if (!response.ok) {
    throw new Error(`Parser /ingest returned ${response.status}: ${await response.text()}`)
  }

  return (await response.json()) as IngestResponse
}

async function callParserMetadata(args: {
  document: DocumentRecord
  aircraft: AircraftRecord | null
  chunks: ParsedChunk[]
}): Promise<MetadataResponse | null> {
  const parserServiceUrl = getUsableParserServiceUrl()
  if (!parserServiceUrl || args.chunks.length === 0) return null

  const response = await fetch(`${parserServiceUrl}/ingest/metadata`, {
    method: 'POST',
    headers: getParserHeaders(),
    body: JSON.stringify({
      document_id: args.document.id,
      chunks: args.chunks,
      aircraft_id: args.document.aircraft_id,
      doc_type: args.document.doc_type,
      make: args.aircraft?.make ?? undefined,
      model: args.aircraft?.model ?? undefined,
    }),
  })

  if (!response.ok) {
    console.warn('[ingestion] metadata extraction skipped', await response.text())
    return null
  }

  return (await response.json()) as MetadataResponse
}

async function insertEmbeddingsCompat(args: {
  supabase: ServiceClient
  document: DocumentRecord
  chunkIdsByIndex: Map<number, string>
  chunks: ParsedChunk[]
}) {
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
  const embeddingInputs = args.chunks.map((chunk) => ({
    id: String(chunk.chunk_index),
    text: chunk.text_for_embedding ?? chunk.display_text ?? '',
  }))

  const embeddings = await generateEmbeddings(embeddingInputs)
  const rows = embeddings
    .map((embedding) => {
      const chunkId = args.chunkIdsByIndex.get(Number(embedding.id))
      if (!chunkId) return null
      return {
        document_id: args.document.id,
        chunk_id: chunkId,
        organization_id: args.document.organization_id,
        aircraft_id: args.document.aircraft_id,
        embedding_model: embeddingModel,
        embedding: embedding.embedding,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (rows.length === 0) return

  const { error } = await args.supabase.from('document_embeddings').insert(rows)
  if (!error) return

  if (isMissingColumnError(error, 'embedding_model')) {
    const legacyRows = rows.map(({ embedding_model, ...row }) => ({
      ...row,
      model: embedding_model,
    }))

    const { error: legacyError } = await args.supabase.from('document_embeddings').insert(legacyRows)
    if (!legacyError) return
    throw new Error(`Failed to insert document embeddings: ${legacyError.message}`)
  }

  throw new Error(`Failed to insert document embeddings: ${error.message}`)
}

async function insertCanonicalEmbeddingsCompat(args: {
  supabase: ServiceClient
  document: DocumentRecord
  chunkIdsByIndex: Map<number, string>
  chunks: ParsedChunk[]
}) {
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
  const embeddingInputs = args.chunks.map((chunk) => ({
    id: String(chunk.chunk_index),
    text: chunk.text_for_embedding ?? chunk.display_text ?? '',
  }))

  const embeddings = await generateEmbeddings(embeddingInputs)
  const rows = embeddings
    .map((embedding) => {
      const chunkId = args.chunkIdsByIndex.get(Number(embedding.id))
      if (!chunkId) return null
      return {
        document_id: args.document.id,
        chunk_id: chunkId,
        organization_id: args.document.organization_id,
        aircraft_id: args.document.aircraft_id,
        embedding_model: embeddingModel,
        embedding: embedding.embedding,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (rows.length === 0) return

  const { error } = await args.supabase.from('canonical_document_embeddings').insert(rows)
  if (!error) return

  throw new Error(`Failed to insert canonical embeddings: ${error.message}`)
}

async function insertCanonicalChunksFromTextNative(args: {
  supabase: ServiceClient
  document: DocumentRecord
  chunks: ParsedChunk[]
  chunkIdsByIndex: Map<number, string>
}) {
  if (args.chunks.length === 0) return

  const rows = args.chunks.map((chunk) => ({
    document_id: args.document.id,
    organization_id: args.document.organization_id,
    aircraft_id: args.document.aircraft_id,
    page_number: chunk.page_number,
    page_number_end: chunk.page_number_end ?? null,
    chunk_index: chunk.chunk_index,
    section_title: chunk.section_title ?? null,
    chunk_text: chunk.display_text ?? chunk.text_for_embedding ?? '',
    token_count: chunk.token_count ?? null,
    char_count: (chunk.display_text ?? chunk.text_for_embedding ?? '').length,
    parser_confidence: null,
    source_chunk_id: args.chunkIdsByIndex.get(chunk.chunk_index) ?? null,
    metadata_json: {
      text_for_embedding: chunk.text_for_embedding ?? chunk.display_text ?? '',
      source: 'text_native',
      is_ocr: false,
    },
  }))

  await args.supabase
    .from('canonical_document_chunks')
    .upsert(rows, { onConflict: 'document_id,chunk_index' })

  const { data: insertedChunks, error } = await args.supabase
    .from('canonical_document_chunks')
    .select('id, chunk_index')
    .eq('document_id', args.document.id)
    .order('chunk_index', { ascending: true })

  if (error || !insertedChunks) {
    throw new Error(`Failed to fetch canonical chunks: ${error?.message ?? 'unknown error'}`)
  }

  await insertCanonicalEmbeddingsCompat({
    supabase: args.supabase,
    document: args.document,
    chunkIdsByIndex: new Map(
      (insertedChunks as Array<{ id: string; chunk_index: number }>).map((chunk) => [
        chunk.chunk_index,
        chunk.id,
      ])
    ),
    chunks: args.chunks,
  })
}

async function insertCanonicalChunksFromOcrSegments(args: {
  supabase: ServiceClient
  document: DocumentRecord
  minConfidence?: number
}) {
  const minConfidence = args.minConfidence ?? 0.86
  const { data: segments, error } = await args.supabase
    .from('ocr_entry_segments')
    .select(
      'id, page_number, segment_index, text_content, confidence, evidence_state, canonical_candidate, reviewer_id, reviewed_at'
    )
    .eq('document_id', args.document.id)
    .eq('canonical_candidate', true)

  if (error || !segments) return

  const canonicalSegments = (segments as Array<any>).filter((segment) => {
    const confidence = typeof segment.confidence === 'number' ? segment.confidence : 0
    const reviewed = Boolean(segment.reviewed_at || segment.reviewer_id)
    return segment.evidence_state === 'canonical_candidate' && (reviewed || confidence >= minConfidence)
  })

  if (canonicalSegments.length === 0) return

  const rows = canonicalSegments.map((segment) => ({
    document_id: args.document.id,
    organization_id: args.document.organization_id,
    aircraft_id: args.document.aircraft_id,
    page_number: segment.page_number,
    page_number_end: null,
    chunk_index: segment.page_number * 1000 + segment.segment_index,
    section_title: null,
    chunk_text: segment.text_content ?? '',
    token_count: null,
    char_count: (segment.text_content ?? '').length,
    parser_confidence: segment.confidence ?? null,
    source_segment_id: segment.id,
    metadata_json: {
      source: 'ocr_segment',
      evidence_state: segment.evidence_state,
      is_ocr: true,
    },
  }))

  await args.supabase
    .from('canonical_document_chunks')
    .upsert(rows, { onConflict: 'document_id,chunk_index' })

  const segmentIds = canonicalSegments.map((segment) => segment.id)
  const { data: canonicalChunks } = await args.supabase
    .from('canonical_document_chunks')
    .select('id, source_segment_id')
    .eq('document_id', args.document.id)
    .in('source_segment_id', segmentIds)

  const canonicalBySegment = new Map(
    ((canonicalChunks as Array<{ id: string; source_segment_id: string | null }> | null) ?? [])
      .filter((row) => row.source_segment_id)
      .map((row) => [row.source_segment_id as string, row.id])
  )

  const embeddingInputs = canonicalSegments.map((segment) => ({
    id: segment.id as string,
    text: segment.text_content ?? '',
  }))

  const embeddings = await generateEmbeddings(embeddingInputs)
  const embeddingRows = embeddings
    .map((embedding) => {
      const canonicalId = canonicalBySegment.get(embedding.id)
      if (!canonicalId) return null
      return {
        document_id: args.document.id,
        chunk_id: canonicalId,
        organization_id: args.document.organization_id,
        aircraft_id: args.document.aircraft_id,
        embedding_model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
        embedding: embedding.embedding,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (embeddingRows.length > 0) {
    await args.supabase.from('canonical_document_embeddings').insert(embeddingRows)
  }
}

async function persistMetadata(args: {
  supabase: ServiceClient
  document: DocumentRecord
  metadata: MetadataResponse | null
  persistMaintenanceEvents?: boolean
}) {
  if (!args.metadata?.metadata) return

  const { error } = await args.supabase.from('document_metadata_extractions').insert({
    document_id: args.document.id,
    organization_id: args.document.organization_id,
    aircraft_id: args.document.aircraft_id,
    extraction_type: 'document_metadata',
    extracted_data: args.metadata.metadata,
  })

  if (error) {
    console.warn('[ingestion] metadata persistence warning:', error.message)
  }

  const maintenanceEvents = args.metadata.metadata.logbook?.maintenance_events ?? []
  if (args.persistMaintenanceEvents === false) return
  if (!args.document.aircraft_id || maintenanceEvents.length === 0) return

  const maintenanceRows = maintenanceEvents.map((event) => ({
    organization_id: args.document.organization_id,
    aircraft_id: args.document.aircraft_id,
    document_id: args.document.id,
    source_page: null,
    event_date: event.date ?? null,
    event_type: event.type ?? null,
    description: event.description ?? null,
    mechanic_name: event.mechanic ?? null,
    airframe_tt: event.airframe_tt ? Number(event.airframe_tt) : null,
    ad_reference: event.ad_reference ?? null,
    raw_text: event.description ?? null,
    confidence: 0.75,
    is_verified: false,
  }))

  await batchInsert(args.supabase, 'maintenance_events', maintenanceRows, 50)
}

async function markDocumentFailed(
  supabase: ServiceClient,
  documentId: string,
  errorMessage: string
) {
  await supabase
    .from('documents')
    .update({
      parsing_status: 'failed',
      parse_error: errorMessage,
      parse_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
}

async function markDocumentNeedsOcr(
  supabase: ServiceClient,
  documentId: string,
  pageCount: number,
  warning?: string
) {
  await supabase
    .from('documents')
    .update({
      page_count: pageCount,
      ocr_required: true,
      parsing_status: 'needs_ocr',
      parse_error: warning ?? null,
      parse_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
}

function hasMeaningfulExtractedEvent(event?: NativeExtractedEvent | null) {
  if (!event) return false

  return Boolean(
    event.event_type ||
      event.event_date ||
      event.tach_time ||
      event.airframe_tt ||
      event.tsmoh ||
      event.mechanic_name ||
      event.mechanic_cert_number ||
      event.ia_number ||
      (event.ad_references && event.ad_references.length > 0) ||
      (event.part_numbers && event.part_numbers.length > 0) ||
      event.return_to_service ||
      (event.work_description && event.work_description.trim().length > 0)
  )
}

function buildOcrPageState(page: ParsedPage, docType: string) {
  const text = page.text.trim()
  const confidence = page.ocr_confidence ?? 0.65
  const isBlank = text.length === 0 || page.page_classification === 'blank'
  const isLogbookDoc = docType.toLowerCase().includes('logbook')
  const pageLooksLikeEntry =
    page.page_classification === 'maintenance_entry' ||
    page.page_classification === 'engine_log' ||
    page.page_classification === 'airframe_log' ||
    page.page_classification === 'prop_log'
  const hasStructuredEvent = hasMeaningfulExtractedEvent(page.extracted_event)

  let arbitrationStatus: 'auto_accept' | 'accept_with_caution' | 'review_required' | 'reject'
  let extractionStatus: 'approved' | 'needs_review' | 'rejected'
  let reviewReason: string | null = null

  if (isBlank) {
    arbitrationStatus = 'auto_accept'
    extractionStatus = 'approved'
  } else if (confidence < 0.45) {
    arbitrationStatus = 'reject'
    extractionStatus = 'rejected'
    reviewReason = 'Low OCR confidence'
  } else if (isLogbookDoc && pageLooksLikeEntry && !hasStructuredEvent) {
    arbitrationStatus = 'review_required'
    extractionStatus = 'needs_review'
    reviewReason = 'OCR text extracted but structured maintenance fields need review'
  } else if (confidence < 0.72) {
    arbitrationStatus = 'review_required'
    extractionStatus = 'needs_review'
    reviewReason = 'OCR confidence below review threshold'
  } else if (confidence < 0.88) {
    arbitrationStatus = 'accept_with_caution'
    extractionStatus = 'approved'
  } else {
    arbitrationStatus = 'auto_accept'
    extractionStatus = 'approved'
  }

  return {
    arbitrationStatus,
    extractionStatus,
    needsHumanReview: extractionStatus === 'needs_review' || extractionStatus === 'rejected',
    reviewReason,
    reasoning: {
      overall_confidence: confidence,
      page_confidence: confidence,
      page_classification: page.page_classification ?? 'unknown',
      source_engine: page.ocr_engine ?? 'openai_pdf_ocr',
      extracted_event_present: hasStructuredEvent,
    },
  }
}

async function persistOcrArtifacts(args: {
  supabase: ServiceClient
  document: DocumentRecord
  pages: ParsedPage[]
}) {
  const relevantPages = args.pages.filter(
    (page) => page.text.trim().length > 0 || page.page_classification === 'blank'
  )

  if (relevantPages.length === 0) return

  const now = new Date().toISOString()
  const scanPageMap = new Map<number, {
    original_image_path?: string | null
    processed_capture_image_path?: string | null
    capture_classification?: string | null
    capture_quality_score?: number | null
    abbyy_classification?: string | null
    abbyy_confidence?: number | null
    abbyy_payload?: Record<string, unknown> | null
  }>()

  if (args.document.scan_batch_id) {
    const { data: scanPages } = await args.supabase
      .from('scan_pages')
      .select(
        'page_number, original_image_path, processed_capture_image_path, capture_classification, capture_quality_score, abbyy_classification, abbyy_confidence, abbyy_payload'
      )
      .eq('scan_batch_id', args.document.scan_batch_id)

    for (const page of (scanPages as Array<any> | null) ?? []) {
      scanPageMap.set(page.page_number, {
        original_image_path: page.original_image_path,
        processed_capture_image_path: page.processed_capture_image_path,
        capture_classification: page.capture_classification,
        capture_quality_score: page.capture_quality_score,
        abbyy_classification: page.abbyy_classification,
        abbyy_confidence: page.abbyy_confidence,
        abbyy_payload: page.abbyy_payload,
      })
    }
  }

  const pageRows = relevantPages.map((page) => {
    const state = buildOcrPageState(page, args.document.doc_type)
    const scanPage = scanPageMap.get(page.page_number)
    return {
      document_id: args.document.id,
      organization_id: args.document.organization_id,
      aircraft_id: args.document.aircraft_id,
      scan_batch_id: args.document.scan_batch_id ?? null,
      page_number: page.page_number,
      page_image_path: scanPage?.original_image_path ?? null,
      processed_image_path: scanPage?.processed_capture_image_path ?? null,
      page_classification: page.page_classification ?? 'unknown',
      classification_confidence: page.ocr_confidence ?? null,
      ocr_raw_text: page.text,
      ocr_confidence: page.ocr_confidence ?? null,
      extraction_status: state.extractionStatus,
      needs_human_review: state.needsHumanReview,
      review_reason: state.reviewReason,
      processed_at: now,
      arbitration_status: state.arbitrationStatus,
      arbitration_confidence: page.ocr_confidence ?? null,
      arbitration_reasoning: state.reasoning,
      engines_run: [page.ocr_engine ?? 'openai_pdf_ocr'],
      abbyy_classification: scanPage?.abbyy_classification ?? scanPage?.capture_classification ?? null,
      abbyy_confidence:
        scanPage?.abbyy_confidence ??
        (typeof scanPage?.capture_quality_score === 'number' ? scanPage?.capture_quality_score : null),
      // The live schema requires a non-null JSON payload for Abbyy-derived metadata.
      // Use an empty object when capture metadata is unavailable so inline OCR retries
      // do not fail before the actual OCR work can begin.
      abbyy_payload: scanPage?.abbyy_payload ?? {},
      updated_at: now,
    }
  })

  const omittedColumns = await insertOcrPageJobsCompat(args.supabase, pageRows, 50)

  if (omittedColumns.size > 0) {
    console.warn('[ingestion] ocr_page_jobs insert used legacy schema compatibility mode', {
      omittedColumns: Array.from(omittedColumns),
      documentId: args.document.id,
    })
  }

  const { data: insertedPageJobs, error: pageJobsError } = await args.supabase
    .from('ocr_page_jobs')
    .select('id, page_number, needs_human_review, review_reason')
    .eq('document_id', args.document.id)

  if (pageJobsError || !insertedPageJobs) {
    throw new Error(`Failed to fetch OCR page jobs: ${pageJobsError?.message ?? 'unknown error'}`)
  }

  const pageJobMap = new Map(
    (insertedPageJobs as Array<{
      id: string
      page_number: number
      needs_human_review: boolean
      review_reason?: string | null
    }>).map((row) => [row.page_number, row])
  )

  const pageJobIds = Array.from(pageJobMap.values()).map((row) => row.id)

  const extractionRunRows = relevantPages.map((page) => {
    const pageJob = pageJobMap.get(page.page_number)
    if (!pageJob) return null
    return {
      page_id: pageJob.id,
      engine_name: page.ocr_engine ?? 'primary_ocr',
      engine_type: 'ocr',
      raw_output: {
        text: page.text,
        page_number: page.page_number,
        page_classification: page.page_classification ?? null,
        geometry_regions: page.geometry_regions ?? [],
      },
      structured_output: page.extracted_event ?? null,
      confidence_summary: {
        overall: page.ocr_confidence ?? null,
      },
    }
  }).filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (extractionRunRows.length > 0) {
    await batchInsert(args.supabase, 'extraction_runs', extractionRunRows, 50)
  }

  const { data: insertedRuns } = await args.supabase
    .from('extraction_runs')
    .select('id, page_id')
    .in('page_id', pageJobIds)
    .order('created_at', { ascending: false })

  const extractionRunByPageId = new Map(
    ((insertedRuns as Array<{ id: string; page_id: string }> | null) ?? [])
      .filter((row) => row.page_id)
      .map((row) => [row.page_id, row.id])
  )

  const segmentDefinitions = buildOcrEntrySegments({
    documentId: args.document.id,
    docType: args.document.doc_type,
    pages: relevantPages.map((page) => ({
      page_number: page.page_number,
      text: page.text,
      ocr_confidence: page.ocr_confidence,
      ocr_engine: page.ocr_engine ?? null,
      page_classification: page.page_classification ?? null,
      geometry_regions: page.geometry_regions ?? [],
    })),
  })

  if (segmentDefinitions.length > 0) {
    const classificationFields = buildClassificationStorageFieldsBySelection(
      args.document.document_group_id,
      args.document.document_detail_id,
      args.document.doc_type as any
    )
    const segmentRows = segmentDefinitions.map((segment) => {
      const pageJob = pageJobMap.get(segment.pageNumber)
      if (!pageJob) {
        throw new Error(`Missing OCR page job for page ${segment.pageNumber}`)
      }

      return {
        ocr_page_job_id: pageJob.id,
        document_id: args.document.id,
        organization_id: args.document.organization_id,
        aircraft_id: args.document.aircraft_id,
        page_number: segment.pageNumber,
        segment_index: segment.segmentIndex,
        sort_order: segment.sortOrder,
        segment_group_key: segment.segmentGroupKey,
        segment_type: segment.segmentType,
        document_group_id: args.document.document_group_id ?? classificationFields?.document_group_id ?? null,
        document_detail_id: args.document.document_detail_id ?? classificationFields?.document_detail_id ?? null,
        document_subtype: args.document.document_subtype ?? null,
        record_family: args.document.record_family ?? classificationFields?.record_family ?? null,
        document_class: args.document.document_class ?? classificationFields?.document_class ?? null,
        truth_role: args.document.truth_role ?? classificationFields?.truth_role ?? null,
        parser_strategy: args.document.parser_strategy ?? classificationFields?.parser_strategy ?? null,
        review_priority: args.document.review_priority ?? classificationFields?.review_priority ?? null,
        canonical_eligibility:
          args.document.canonical_eligibility ?? classificationFields?.canonical_eligibility ?? segment.canonicalCandidate,
        reminder_relevance:
          args.document.reminder_relevance ?? classificationFields?.reminder_relevance ?? false,
        ad_relevance:
          args.document.ad_relevance ?? classificationFields?.ad_relevance ?? false,
        inspection_relevance:
          args.document.inspection_relevance ?? classificationFields?.inspection_relevance ?? false,
        completeness_relevance:
          args.document.completeness_relevance ?? classificationFields?.completeness_relevance ?? true,
        intelligence_tags:
          args.document.intelligence_tags ?? classificationFields?.intelligence_tags ?? [],
        evidence_state: segment.evidenceState,
        text_content: segment.textContent,
        normalized_text: segment.normalizedText,
        excerpt_text: segment.excerptText,
        confidence: segment.confidence,
        source_engine: segment.sourceEngine,
        canonical_candidate: segment.canonicalCandidate,
        suppression_reason: segment.suppressionReason,
        cross_page_continuation: segment.crossPageContinuation,
        bounding_regions: segment.boundingRegions,
        metadata_json: {
          ...segment.metadataJson,
          local_key: segment.localKey,
          previous_local_key: segment.previousLocalKey ?? null,
          next_local_key: segment.nextLocalKey ?? null,
        },
        updated_at: now,
      }
    })

    await batchInsert(args.supabase, 'ocr_entry_segments', segmentRows, 100)
  }

  const { data: insertedSegments, error: segmentsError } = await args.supabase
    .from('ocr_entry_segments')
    .select(
      'id, ocr_page_job_id, page_number, segment_index, segment_group_key, evidence_state, canonical_candidate, segment_type, confidence, metadata_json'
    )
    .eq('document_id', args.document.id)
    .order('page_number', { ascending: true })
    .order('segment_index', { ascending: true })

  if (segmentsError) {
    throw new Error(`Failed to fetch OCR entry segments: ${segmentsError.message}`)
  }

  const segmentRowsTyped = (insertedSegments as InsertedSegmentRow[] | null) ?? []
  const localKeyToId = new Map<string, string>()

  for (const row of segmentRowsTyped) {
    const metadata = (row.metadata_json ?? {}) as Record<string, unknown>
    const localKey =
      typeof metadata.local_key === 'string'
        ? metadata.local_key
        : `${row.page_number}:${row.segment_index}`
    localKeyToId.set(localKey, row.id)
  }

  for (const row of segmentRowsTyped) {
    const metadata = (row.metadata_json ?? {}) as Record<string, unknown>
    const previousLocalKey =
      typeof metadata.previous_local_key === 'string' ? metadata.previous_local_key : null
    const nextLocalKey =
      typeof metadata.next_local_key === 'string' ? metadata.next_local_key : null
    const neighboringIds = [previousLocalKey, nextLocalKey]
      .map((localKey) => (localKey ? localKeyToId.get(localKey) ?? null : null))
      .filter((value): value is string => Boolean(value))

    if (!previousLocalKey && !nextLocalKey) continue

    await args.supabase
      .from('ocr_entry_segments')
      .update({
        previous_segment_id: previousLocalKey ? localKeyToId.get(previousLocalKey) ?? null : null,
        next_segment_id: nextLocalKey ? localKeyToId.get(nextLocalKey) ?? null : null,
        neighboring_segment_ids: neighboringIds,
      })
      .eq('id', row.id)
  }

  const bestSegmentByPage = new Map<number, InsertedSegmentRow>()
  for (const row of segmentRowsTyped) {
    const current = bestSegmentByPage.get(row.page_number)
    const currentScore =
      current != null ? (current.canonical_candidate ? 1000 : 0) + (current.confidence ?? 0) : Number.NEGATIVE_INFINITY
    const nextScore = (row.canonical_candidate ? 1000 : 0) + (row.confidence ?? 0)
    if (!current || nextScore > currentScore) {
      bestSegmentByPage.set(row.page_number, row)
    }
  }

  const extractedFieldCandidateRows: Array<Record<string, unknown>> = []
  const fieldConflictRows: Array<Record<string, unknown>> = []

  const segmentFieldCandidateRows = relevantPages
    .map((page) => {
      const bestSegment = bestSegmentByPage.get(page.page_number)
      const pageJob = pageJobMap.get(page.page_number)
      if (!bestSegment) return []

      const rows: Array<Record<string, unknown>> = [
        (() => {
          const validation = validateOcrField('page_classification', page.page_classification ?? 'unknown')
          if (pageJob) {
            extractedFieldCandidateRows.push({
              page_id: pageJob.id,
              extraction_run_id: extractionRunByPageId.get(pageJob.id) ?? null,
              field_name: 'page_classification',
              candidate_value: page.page_classification ?? 'unknown',
              source_engine: page.ocr_engine ?? 'primary_ocr',
              raw_confidence: page.ocr_confidence ?? null,
              validation_status: validation.status,
              validation_notes: validation.notes ?? null,
              normalized_value: validation.normalized ?? page.page_classification ?? 'unknown',
            })
            if (validation.status === 'invalid' || validation.status === 'suspicious') {
              fieldConflictRows.push({
                page_id: pageJob.id,
                field_name: 'page_classification',
                candidate_values: [
                  {
                    engine: page.ocr_engine ?? 'primary_ocr',
                    value: page.page_classification ?? 'unknown',
                    confidence: page.ocr_confidence ?? null,
                  },
                ],
                conflict_reason: 'validation_failure',
                severity: validation.status === 'invalid' ? 'high' : 'medium',
              })
            }
          }

          return {
            segment_id: bestSegment.id,
            field_name: 'page_classification',
            candidate_value: page.page_classification ?? 'unknown',
            normalized_value: validation.normalized ?? page.page_classification ?? 'unknown',
            source_engine: page.ocr_engine ?? 'primary_ocr',
            source_kind: 'raw_ocr_candidate',
            raw_confidence: page.ocr_confidence ?? null,
            validation_status: validation.status,
            validation_notes: validation.notes ?? null,
            candidate_metadata: { page_number: page.page_number },
          }
        })(),
      ]

      if (page.extracted_event) {
        const event = page.extracted_event
        const mappings: Array<[string, string | null]> = [
          ['entry_date', event.event_date ?? null],
          ['event_type', event.event_type ?? null],
          ['tach_time', event.tach_time ?? null],
          ['airframe_tt', event.airframe_tt ?? null],
          ['tsmoh', event.tsmoh ?? null],
          ['work_description', event.work_description ?? null],
          ['mechanic_name', event.mechanic_name ?? null],
          ['mechanic_cert_number', event.mechanic_cert_number ?? null],
          ['ia_cert_number', event.ia_number ?? null],
          ['return_to_service', event.return_to_service != null ? String(event.return_to_service) : null],
          ['ad_reference', event.ad_references?.join(', ') ?? null],
          ['part_number', event.part_numbers?.join(', ') ?? null],
        ]

        for (const [fieldName, candidateValue] of mappings) {
          const validation = validateOcrField(fieldName, candidateValue)
          rows.push({
            segment_id: bestSegment.id,
            field_name: fieldName,
            candidate_value: candidateValue,
            normalized_value: validation.normalized ?? candidateValue,
            source_engine: page.ocr_engine ?? 'primary_ocr',
            source_kind: 'raw_ocr_candidate',
            raw_confidence: event.confidence_overall ?? page.ocr_confidence ?? null,
            validation_status: validation.status,
            validation_notes: validation.notes ?? null,
            candidate_metadata: { page_number: page.page_number },
          })

          if (pageJob) {
            extractedFieldCandidateRows.push({
              page_id: pageJob.id,
              extraction_run_id: extractionRunByPageId.get(pageJob.id) ?? null,
              field_name: fieldName,
              candidate_value: candidateValue,
              source_engine: page.ocr_engine ?? 'primary_ocr',
              raw_confidence: event.confidence_overall ?? page.ocr_confidence ?? null,
              validation_status: validation.status,
              validation_notes: validation.notes ?? null,
              normalized_value: validation.normalized ?? candidateValue,
            })
            if (validation.status === 'invalid' || validation.status === 'suspicious') {
              fieldConflictRows.push({
                page_id: pageJob.id,
                field_name: fieldName,
                candidate_values: [
                  {
                    engine: page.ocr_engine ?? 'primary_ocr',
                    value: candidateValue,
                    confidence: event.confidence_overall ?? page.ocr_confidence ?? null,
                  },
                ],
                conflict_reason: 'validation_failure',
                severity: validation.status === 'invalid' ? 'high' : 'medium',
              })
            }
          }
        }
      }

      return rows
    })
    .flat()

  if (segmentFieldCandidateRows.length > 0) {
    await batchInsert(args.supabase, 'ocr_segment_field_candidates', segmentFieldCandidateRows, 100)
  }

  if (extractedFieldCandidateRows.length > 0) {
    await batchInsert(args.supabase, 'extracted_field_candidates', extractedFieldCandidateRows, 100)
  }

  if (fieldConflictRows.length > 0) {
    await batchInsert(args.supabase, 'field_conflicts', fieldConflictRows, 100)
  }

  const eventRows = relevantPages
    .filter((page) => hasMeaningfulExtractedEvent(page.extracted_event))
    .map((page) => {
      const pageJob = pageJobMap.get(page.page_number)
      const bestSegment = bestSegmentByPage.get(page.page_number)
      if (!pageJob || !page.extracted_event) return null

      return {
        ocr_page_job_id: pageJob.id,
        ocr_entry_segment_id: bestSegment?.id ?? null,
        document_id: args.document.id,
        organization_id: args.document.organization_id,
        aircraft_id: args.document.aircraft_id,
        page_number: page.page_number,
        segment_group_key: bestSegment?.segment_group_key ?? null,
        evidence_state: bestSegment?.evidence_state ?? null,
        event_type: page.extracted_event.event_type ?? null,
        logbook_type: page.extracted_event.logbook_type ?? null,
        event_date: page.extracted_event.event_date ?? null,
        tach_time: page.extracted_event.tach_time ? Number(page.extracted_event.tach_time) : null,
        airframe_tt: page.extracted_event.airframe_tt
          ? Number(page.extracted_event.airframe_tt)
          : null,
        tsmoh: page.extracted_event.tsmoh ? Number(page.extracted_event.tsmoh) : null,
        work_description: page.extracted_event.work_description ?? null,
        work_description_normalized: page.extracted_event.work_description ?? null,
        ata_chapter: null,
        part_numbers:
          page.extracted_event.part_numbers && page.extracted_event.part_numbers.length > 0
            ? page.extracted_event.part_numbers
            : null,
        serial_numbers: null,
        ad_references:
          page.extracted_event.ad_references && page.extracted_event.ad_references.length > 0
            ? page.extracted_event.ad_references
            : null,
        far_references: null,
        manual_references: null,
        mechanic_name: page.extracted_event.mechanic_name ?? null,
        mechanic_cert_number: page.extracted_event.mechanic_cert_number ?? null,
        ia_number: page.extracted_event.ia_number ?? null,
        repair_station_cert: null,
        return_to_service: page.extracted_event.return_to_service ?? false,
        rts_by: null,
        confidence_overall:
          page.extracted_event.confidence_overall ?? page.ocr_confidence ?? null,
        confidence_date:
          page.extracted_event.event_date && page.extracted_event.confidence_overall != null
            ? page.extracted_event.confidence_overall
            : null,
        confidence_tach:
          page.extracted_event.tach_time && page.extracted_event.confidence_overall != null
            ? page.extracted_event.confidence_overall
            : null,
        confidence_mechanic:
          page.extracted_event.mechanic_name && page.extracted_event.confidence_overall != null
            ? page.extracted_event.confidence_overall
            : null,
        raw_text: page.text,
        review_status:
          pageJob.needs_human_review || bestSegment?.evidence_state === 'review_required'
            ? 'needs_review'
            : 'approved',
        created_at: now,
        updated_at: now,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  if (eventRows.length > 0) {
    await batchInsert(args.supabase, 'ocr_extracted_events', eventRows, 50)
  }

  const { data: insertedEvents } = await args.supabase
    .from('ocr_extracted_events')
    .select('id, ocr_page_job_id')
    .eq('document_id', args.document.id)

  const eventByPageJobId = new Map(
    ((insertedEvents as Array<{ id: string; ocr_page_job_id: string }> | null) ?? []).map((row) => [
      row.ocr_page_job_id,
      row.id,
    ])
  )

  const pageIdsWithSegmentReview = new Set(
    segmentRowsTyped
      .filter(
        (segment) =>
          segment.evidence_state === 'review_required' &&
          (segment.canonical_candidate ||
            segment.segment_type === 'signoff_block' ||
            segment.segment_type === 'attached_tag')
      )
      .map((segment) => segment.ocr_page_job_id)
  )

  const segmentQueueRows = segmentRowsTyped
    .filter(
      (segment) =>
        segment.evidence_state === 'review_required' &&
        (segment.canonical_candidate ||
          segment.segment_type === 'signoff_block' ||
          segment.segment_type === 'attached_tag')
    )
    .map((segment) => ({
      organization_id: args.document.organization_id,
      aircraft_id: args.document.aircraft_id,
      ocr_page_job_id: segment.ocr_page_job_id,
      ocr_entry_segment_id: segment.id,
      segment_group_key: segment.segment_group_key,
      evidence_state: segment.evidence_state,
      ocr_extracted_event_id: eventByPageJobId.get(segment.ocr_page_job_id) ?? null,
      queue_type: 'ocr_page',
      review_scope: 'segment',
      priority: segment.canonical_candidate ? 'high' : 'normal',
      reason: 'Segment review required before canonicalization',
      status: 'pending',
    }))

  const pageQueueRows = Array.from(pageJobMap.values())
    .filter((pageJob) => pageJob.needs_human_review && !pageIdsWithSegmentReview.has(pageJob.id))
    .map((pageJob) => ({
      organization_id: args.document.organization_id,
      aircraft_id: args.document.aircraft_id,
      ocr_page_job_id: pageJob.id,
      ocr_extracted_event_id: eventByPageJobId.get(pageJob.id) ?? null,
      queue_type: 'ocr_page',
      review_scope: 'page',
      priority: 'normal',
      reason: pageJob.review_reason ?? 'OCR review required',
      status: 'pending',
    }))

  const queueRows = [...segmentQueueRows, ...pageQueueRows]

  if (queueRows.length > 0) {
    await batchInsert(args.supabase, 'review_queue_items', queueRows, 50)
  }

  const { count: conflictCount } = await args.supabase
    .from('field_conflicts')
    .select('id', { count: 'exact', head: true })
    .in('page_id', Array.from(pageJobMap.values()).map((pageJob) => pageJob.id))

  await recordDocumentDriftSnapshot({
    supabase: args.supabase,
    organizationId: args.document.organization_id,
    documentId: args.document.id,
    documentFamily: args.document.doc_type,
    providerName: relevantPages[0]?.ocr_engine ?? 'mixed',
    pages: relevantPages,
    segments: segmentRowsTyped.map((segment) => ({
      segmentType: segment.segment_type,
      evidenceState: segment.evidence_state,
      canonicalCandidate: segment.canonical_candidate,
    })),
    conflictCount: conflictCount ?? 0,
  })
}

export async function ingestDocumentInline(documentId: string): Promise<DocumentIngestionResult> {
  const supabase = createServiceSupabase()
  const { document, aircraft } = await fetchDocumentRecord(supabase, documentId)
  let fallbackPageCount = document.page_count ?? 0

  try {
    await supabase
      .from('documents')
      .update({
        parsing_status: 'parsing',
        parse_started_at: new Date().toISOString(),
        parse_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    await clearDerivedArtifacts(supabase, documentId)

    const fileUrl = await createSignedDocumentUrl(supabase, document.file_path)
    const parserServiceUrl = getUsableParserServiceUrl()
    const runInlinePdfParser = async () => {
      const nativeData = await parseTextNativePdf({
        fileUrl,
        docType: document.doc_type,
        title: document.title,
        make: aircraft?.make ?? null,
        model: aircraft?.model ?? null,
      })
      fallbackPageCount = nativeData.page_count

      if (nativeData.is_text_native) {
        return nativeData
      }

      await supabase
        .from('documents')
        .update({
          is_text_native: false,
          page_count: nativeData.page_count,
          parsing_status: 'ocr_processing',
          ocr_required: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)

      return parseScannedPdfWithFallbacks({
        fileUrl,
        docType: document.doc_type,
        title: document.title,
        pageCount: nativeData.page_count,
        make: aircraft?.make ?? null,
        model: aircraft?.model ?? null,
      })
    }

    let ingestData: IngestResponse
    let metadata: MetadataResponse | null = null

    if (parserServiceUrl) {
      try {
        ingestData = await callParserIngest({ document, aircraft, fileUrl })
        metadata = await callParserMetadata({
          document,
          aircraft,
          chunks: ingestData.chunks,
        })

        if (!ingestData.is_text_native && ingestData.chunks.length === 0) {
          ingestData = await runInlinePdfParser()
          metadata = await extractMetadataInline({
            docType: document.doc_type,
            make: aircraft?.make ?? null,
            model: aircraft?.model ?? null,
            chunks: ingestData.chunks,
          })
        }
      } catch (parserError) {
        console.warn('[ingestion] external parser unavailable, falling back to inline parser', {
          documentId,
          error: parserError instanceof Error ? parserError.message : parserError,
        })

        ingestData = await runInlinePdfParser()
        metadata = await extractMetadataInline({
          docType: document.doc_type,
          make: aircraft?.make ?? null,
          model: aircraft?.model ?? null,
          chunks: ingestData.chunks,
        })
      }
    } else {
      ingestData = await runInlinePdfParser()
      metadata = await extractMetadataInline({
        docType: document.doc_type,
        make: aircraft?.make ?? null,
        model: aircraft?.model ?? null,
        chunks: ingestData.chunks,
      })
    }

    await supabase
      .from('documents')
      .update({
        is_text_native: ingestData.is_text_native,
        page_count: ingestData.page_count,
        parsing_status: 'chunking',
        ocr_required: !ingestData.is_text_native,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    if (ingestData.chunks.length === 0) {
      await markDocumentNeedsOcr(
        supabase,
        documentId,
        ingestData.page_count,
        'Parser returned no extractable text; OCR review required.'
      )
      return { mode: 'inline', status: 'needs_ocr' }
    }

    if (ingestData.pages.length > 0) {
      const pageRows = ingestData.pages.map((page) => ({
        document_id: documentId,
        organization_id: document.organization_id,
        aircraft_id: document.aircraft_id,
        page_number: page.page_number,
        page_text: page.text,
        ocr_confidence: page.ocr_confidence ?? null,
        word_count: page.word_count ?? null,
        char_count: page.char_count ?? page.text.length,
      }))

      await batchInsert(supabase, 'document_pages', pageRows, 50)
    }

    if (!ingestData.is_text_native && ingestData.pages.length > 0) {
      await persistOcrArtifacts({
        supabase,
        document,
        pages: ingestData.pages,
      })
    }

    const chunkRows = ingestData.chunks.map((chunk) => ({
      document_id: documentId,
      organization_id: document.organization_id,
      aircraft_id: document.aircraft_id,
      page_number: chunk.page_number,
      page_number_end: chunk.page_number_end ?? null,
      chunk_index: chunk.chunk_index,
      section_title: chunk.section_title ?? null,
      parent_section: null,
      chunk_text: chunk.display_text ?? chunk.text_for_embedding ?? '',
      token_count: chunk.token_count ?? null,
      char_count: (chunk.display_text ?? chunk.text_for_embedding ?? '').length,
      parser_confidence: null,
      metadata_json: {
        text_for_embedding: chunk.text_for_embedding ?? chunk.display_text ?? '',
        is_ocr: !ingestData.is_text_native,
      },
    }))

    await batchInsert(supabase, 'document_chunks', chunkRows, 50)

    const { data: insertedChunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('id, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true })

    if (chunksError || !insertedChunks) {
      throw new Error(`Failed to fetch inserted chunks: ${chunksError?.message ?? 'unknown error'}`)
    }

    await supabase
      .from('documents')
      .update({
        parsing_status: 'embedding',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    await insertEmbeddingsCompat({
      supabase,
      document,
      chunkIdsByIndex: new Map(
        (insertedChunks as Array<{ id: string; chunk_index: number }>).map((chunk) => [
          chunk.chunk_index,
          chunk.id,
        ])
      ),
      chunks: ingestData.chunks,
    })

    if (ingestData.is_text_native) {
      await insertCanonicalChunksFromTextNative({
        supabase,
        document,
        chunks: ingestData.chunks,
        chunkIdsByIndex: new Map(
          (insertedChunks as Array<{ id: string; chunk_index: number }>).map((chunk) => [
            chunk.chunk_index,
            chunk.id,
          ])
        ),
      })
    } else {
      await insertCanonicalChunksFromOcrSegments({
        supabase,
        document,
      })
    }

    await persistMetadata({
      supabase,
      document,
      metadata,
      persistMaintenanceEvents:
        ingestData.is_text_native || !document.doc_type.toLowerCase().includes('logbook'),
    })

    await supabase
      .from('documents')
      .update({
        parsing_status: 'completed',
        parse_completed_at: new Date().toISOString(),
        parse_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    return { mode: 'inline', status: 'completed' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Inline ingestion failed'
    if (error instanceof OcrNotConfiguredError || (error as { name?: string })?.name === 'OcrNotConfiguredError') {
      await markDocumentNeedsOcr(supabase, documentId, fallbackPageCount, errorMessage)
      return { mode: 'inline', status: 'needs_ocr', warning: errorMessage }
    }

    await markDocumentFailed(supabase, documentId, errorMessage)
    throw error
  }
}

export async function queueDocumentIngestion(
  documentId: string,
  options?: { allowInlineFallback?: boolean; preferBackground?: boolean }
): Promise<DocumentIngestionResult> {
  const preferBackground = options?.preferBackground ?? false
  const triggerConfigured = isTriggerConfigured()

  if (!preferBackground) {
    try {
      const result = await ingestDocumentInline(documentId)
      return result
    } catch (inlineError) {
      console.warn('[ingestion] inline ingestion failed, attempting background queue', inlineError)

      if (options?.allowInlineFallback === false) {
        const warning = inlineError instanceof Error ? inlineError.message : 'Inline ingestion failed'
        return {
          mode: 'queued',
          status: 'failed',
          warning,
        }
      }
    }
  }

  if (preferBackground && !triggerConfigured) {
    try {
      const result = await ingestDocumentInline(documentId)
      return {
        ...result,
        warning: 'Processed inline because Trigger.dev is not configured in this environment.',
      }
    } catch (inlineError) {
      const warning =
        inlineError instanceof Error
          ? `Trigger.dev is not configured and inline ingestion failed: ${inlineError.message}`
          : 'Trigger.dev is not configured and inline ingestion failed.'

      return {
        mode: 'queued',
        status: 'failed',
        warning,
      }
    }
  }

  try {
    const result = await enqueueDocumentIngestionBackground(documentId)
    return {
      ...result,
      warning: preferBackground
        ? result.warning
        : result.warning ??
          'Queued for background processing after inline ingestion was unavailable.',
    }
  } catch (triggerError) {
    console.warn('[ingestion] trigger enqueue failed', triggerError)

    if (options?.allowInlineFallback === false || !preferBackground) {
      const warning =
        triggerError instanceof Error ? triggerError.message : 'Trigger enqueue failed'
      return {
        mode: 'queued',
        status: 'failed',
        warning,
      }
    }

    try {
      const result = await ingestDocumentInline(documentId)
      return {
        ...result,
        warning: 'Processed inline because the background queue was unavailable.',
      }
    } catch (inlineError) {
      const warning = inlineError instanceof Error ? inlineError.message : 'Inline ingestion failed'
      return {
        mode: 'queued',
        status: 'failed',
        warning,
      }
    }
  }
}

export async function enqueueDocumentIngestionBackground(
  documentId: string
): Promise<DocumentIngestionResult> {
  if (!isTriggerConfigured()) {
    return {
      mode: 'queued',
      status: 'failed',
      warning: 'Trigger.dev is not configured in this environment.',
    }
  }

  try {
    ensureTriggerSecretKey()
    await tasks.trigger('ingest-document', { documentId })
    return {
      mode: 'trigger',
      status: 'queued',
    }
  } catch (error) {
    return {
      mode: 'queued',
      status: 'failed',
      warning: error instanceof Error ? error.message : 'Trigger enqueue failed',
    }
  }
}
