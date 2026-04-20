import { DetectDocumentTextCommand, TextractClient } from '@aws-sdk/client-textract'
import { GoogleAuth } from 'google-auth-library'
import OpenAI, { toFile } from 'openai'
import { PDFDocument } from 'pdf-lib'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const OCR_BATCH_SIZE = 6
const OCR_MAX_OUTPUT_TOKENS = 12000
const OCR_TEXT_ENRICH_BATCH_SIZE = 8
const OCR_TEXT_ENRICH_MAX_CHARS = 12000
const DOCUMENT_AI_TIMEOUT_MS = 90_000
const DOCUMENT_AI_MAX_PAGES_PER_REQUEST = 15
const OCR_TEXT_ENRICH_TIMEOUT_MS = 45_000
const OPENAI_OCR_BATCH_TIMEOUT_MS = 75_000
const OPENAI_FILE_UPLOAD_TIMEOUT_MS = 60_000
const TEXTRACT_TIMEOUT_MS = 90_000
const LOCAL_OCR_TIMEOUT_MS = 120_000
const TARGET_CHUNK_TOKENS = 600
const CHUNK_OVERLAP_TOKENS = 80
const TEXT_NATIVE_MIN_CHARS = 100
const TEXT_NATIVE_SAMPLE_PAGES = 3
const GOOGLE_CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

const OCR_CLASSIFICATIONS = new Set([
  'engine_log',
  'airframe_log',
  'prop_log',
  'maintenance_entry',
  'work_order',
  'ad_compliance',
  'cover',
  'blank',
  'unknown',
])

function getTrimmedEnvValue(name: string) {
  const value = process.env[name]?.replace(/\\n/g, '\n').trim()
  return value ? value : undefined
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

function extractJsonObjectCandidate(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const unfenced = fencedMatch?.[1]?.trim() ?? trimmed

  const firstBrace = unfenced.indexOf('{')
  const lastBrace = unfenced.lastIndexOf('}')

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return unfenced.slice(firstBrace, lastBrace + 1)
  }

  return unfenced
}

export function parseOpenAiJsonOutput<T>(raw: string): T {
  const candidate = extractJsonObjectCandidate(raw)
  return JSON.parse(candidate) as T
}

function isRecoverableJsonParseError(error: unknown) {
  if (!(error instanceof SyntaxError)) return false
  return /JSON|Unexpected|Unterminated|Expected/i.test(error.message)
}

export interface NativeExtractedEvent {
  event_type?: string | null
  logbook_type?: string | null
  event_date?: string | null
  tach_time?: string | null
  airframe_tt?: string | null
  tsmoh?: string | null
  work_description?: string | null
  mechanic_name?: string | null
  mechanic_cert_number?: string | null
  ia_number?: string | null
  ad_references?: string[]
  part_numbers?: string[]
  return_to_service?: boolean | null
  confidence_overall?: number | null
}

export interface NativePageGeometryRegion {
  text: string
  normalized_text: string
  page: number
  x: number
  y: number
  width: number
  height: number
  source: string
  kind: string
  confidence?: number | null
  start_index?: number | null
  end_index?: number | null
}

export interface NativeParsedPage {
  page_number: number
  text: string
  ocr_confidence: number
  word_count: number
  char_count: number
  ocr_engine?: string | null
  page_classification?: string | null
  extracted_event?: NativeExtractedEvent | null
  geometry_regions?: NativePageGeometryRegion[]
}

export class OcrNotConfiguredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OcrNotConfiguredError'
  }
}

export interface NativeParsedChunk {
  chunk_index: number
  page_number: number
  page_number_end?: number
  section_title?: string
  text_for_embedding: string
  display_text: string
  token_count: number
}

export interface NativeIngestResponse {
  is_text_native: boolean
  page_count: number
  pages: NativeParsedPage[]
  chunks: NativeParsedChunk[]
}

export interface NativeMetadataEvent {
  date?: string
  type?: string
  description?: string
  mechanic?: string
  airframe_tt?: string
  ad_reference?: string
}

export interface NativeMetadataResponse {
  metadata?: {
    logbook?: {
      maintenance_events?: NativeMetadataEvent[]
      tail_numbers?: string[]
      serial_numbers?: string[]
      engine_serial_numbers?: string[]
    }
    poh_afm?: {
      revision?: string | null
      effective_date?: string | null
      aircraft_models_applicable?: string[]
      faa_approval_number?: string | null
    }
    ad_sb?: {
      ad_number?: string | null
      sb_number?: string | null
      subject?: string | null
      effective_date?: string | null
      compliance_date?: string | null
      affected_models?: string[]
      compliance_method?: string | null
    }
  }
}

interface NativeChunkMetadata {
  docType: string
  title: string
  make?: string | null
  model?: string | null
}

interface OcrBatchResultPage {
  page_number: number
  text?: string
  ocr_confidence?: number
  page_classification?: string | null
  extracted_event?: Record<string, unknown> | null
}

interface OcrTextAnnotationPage {
  page_number: number
  page_classification?: string | null
  extracted_event?: Record<string, unknown> | null
}

interface DocumentAiProcessResponse {
  document?: {
    text?: string
    pages?: Array<Record<string, unknown>>
  }
}

interface DocumentAiConfig {
  projectId: string
  location: string
  processorId: string
  credentialsJson?: string
  credentialsPath?: string
}

interface DocumentAiSchemaOverride {
  displayName?: string
  description?: string
  entityTypes: Array<{
    name: string
    baseTypes?: string[]
    properties?: Array<{
      name: string
      valueType?: string
      occurrenceType?: string
    }>
  }>
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

function getDocumentAiConfig(): DocumentAiConfig | null {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim()
  const location = process.env.DOCUMENT_AI_LOCATION?.trim()
  const processorId = process.env.DOCUMENT_AI_PROCESSOR_ID?.trim()
  const credentialsJson =
    process.env.GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim()
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()

  if (!projectId || !location || !processorId) {
    return null
  }

  if (!credentialsJson && !credentialsPath) {
    return null
  }

  return {
    projectId,
    location,
    processorId,
    credentialsJson,
    credentialsPath,
  }
}

function getDocumentAiSchemaOverride(): DocumentAiSchemaOverride {
  const raw = process.env.DOCUMENT_AI_SCHEMA_JSON?.trim()
  if (raw) {
    try {
      return JSON.parse(raw) as DocumentAiSchemaOverride
    } catch (error) {
      console.warn('[ingestion] invalid DOCUMENT_AI_SCHEMA_JSON, using default schema override', error)
    }
  }

  return {
    displayName: 'CDE Schema',
    description: 'Document Schema for the CDE Processor',
    entityTypes: [
      {
        name: 'custom_extraction_document_type',
        baseTypes: ['document'],
        properties: [
          {
            name: 'description',
            valueType: 'string',
            occurrenceType: 'OPTIONAL_MULTIPLE',
          },
        ],
      },
    ],
  }
}

function hasTextractConfig() {
  return Boolean(
    getTrimmedEnvValue('AWS_REGION') &&
      getTrimmedEnvValue('AWS_ACCESS_KEY_ID') &&
      getTrimmedEnvValue('AWS_SECRET_ACCESS_KEY')
  )
}

function getLocalOcrScriptPath() {
  const explicit = process.env.LOCAL_OCR_SCRIPT_PATH?.trim()
  if (explicit) return explicit
  const candidate = path.join(process.cwd(), 'scripts', 'local_ocr.py')
  return fs.existsSync(candidate) ? candidate : null
}

function hasLocalOcrConfig() {
  return Boolean(getLocalOcrScriptPath())
}

function isTextractEnabled() {
  return process.env.ENABLE_TEXTRACT_OCR === 'true' && hasTextractConfig()
}

export function hasConfiguredOcrEngine() {
  return Boolean(
    getDocumentAiConfig() ||
      hasLocalOcrConfig() ||
      process.env.OPENAI_API_KEY ||
      isTextractEnabled()
  )
}

export function getUsableParserServiceUrl(url = process.env.PARSER_SERVICE_URL): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (/placeholder/i.test(trimmed)) return null

  try {
    const parsed = new URL(trimmed)
    if (!/^https?:$/.test(parsed.protocol)) return null
    return trimmed.replace(/\/+$/, '')
  } catch {
    return null
  }
}

async function downloadPdfBytes(fileUrl: string) {
  const response = await fetch(fileUrl)
  if (!response.ok) {
    throw new Error(`Failed to download PDF for inline parsing: ${response.status}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js')
  const globalPdfJs = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown }
  }

  if (!globalPdfJs.pdfjsWorker?.WorkerMessageHandler) {
    try {
      globalPdfJs.pdfjsWorker = require('pdfjs-dist/legacy/build/pdf.worker.js')
    } catch (error) {
      console.warn('[ingestion/native-pdf] failed to preload pdf.js worker', error)
    }
  }

  return pdfjs
}

function normalizeLine(parts: string[]) {
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

async function extractPageText(page: any): Promise<string> {
  const textContent = await page.getTextContent()
  const lines: string[] = []
  let currentLine: string[] = []
  let currentY: number | null = null

  const flush = () => {
    const normalized = normalizeLine(currentLine)
    if (normalized) lines.push(normalized)
    currentLine = []
    currentY = null
  }

  for (const item of textContent.items as Array<any>) {
    if (!item || typeof item.str !== 'string') continue

    const value = item.str.replace(/\u0000/g, '').trim()
    if (!value) {
      if (item.hasEOL) flush()
      continue
    }

    const y =
      Array.isArray(item.transform) && typeof item.transform[5] === 'number'
        ? Math.round(item.transform[5] * 10) / 10
        : null

    if (currentY !== null && y !== null && Math.abs(currentY - y) > 2.5) {
      flush()
    }

    currentLine.push(value)
    currentY = y

    if (item.hasEOL) flush()
  }

  flush()
  return lines.join('\n').trim()
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

function isSectionHeader(line: string) {
  const stripped = line.trim()
  if (!stripped || stripped.length >= 80) return false
  if (/[.!?]$/.test(stripped)) return false

  const alphaChars = stripped.replace(/[^a-zA-Z]/g, '')
  if (alphaChars && alphaChars === alphaChars.toUpperCase() && alphaChars.length >= 3) {
    return true
  }

  if (/^\d+(\.\d+)*\.?\s+\S/.test(stripped)) return true
  if (/^(section|chapter|appendix|part)\s+\d/i.test(stripped)) return true
  return false
}

function extractOverlap(text: string) {
  const charBudget = CHUNK_OVERLAP_TOKENS * 4
  if (text.length <= charBudget) return text
  return text.slice(-charBudget)
}

function chunkPages(pages: NativeParsedPage[], metadata: NativeChunkMetadata): NativeParsedChunk[] {
  if (pages.length === 0) return []

  const linesWithPages = pages.flatMap((page) =>
    page.text.split(/\r?\n/).map((line) => ({ line, pageNumber: page.page_number }))
  )

  const chunks: NativeParsedChunk[] = []
  let currentLines: string[] = []
  let currentPages: number[] = []
  let currentSection: string | undefined
  let currentTokens = 0
  let overlapText = ''

  const flush = () => {
    if (currentLines.length === 0) return

    const text = currentLines.join('\n').trim()
    if (!text) {
      currentLines = []
      currentPages = []
      currentTokens = 0
      return
    }

    const fullText = overlapText ? `${overlapText}\n${text}`.trim() : text
    const minPage = Math.min(...currentPages)
    const maxPage = Math.max(...currentPages)
    const aircraft = [metadata.make, metadata.model].filter(Boolean).join(' ').trim() || 'Unknown'
    const section = currentSection ?? 'General'
    const header =
      `Aircraft: ${aircraft}\n` +
      `Document: ${metadata.docType} - ${metadata.title}\n` +
      `Section: ${section}\n` +
      `Pages: ${minPage}-${maxPage}\n---\n`

    chunks.push({
      chunk_index: chunks.length,
      text_for_embedding: `${header}${fullText}`,
      display_text: fullText,
      page_number: minPage,
      page_number_end: maxPage,
      section_title: currentSection,
      token_count: estimateTokens(`${header}${fullText}`),
    })

    overlapText = extractOverlap(fullText)
    currentLines = []
    currentPages = []
    currentTokens = 0
  }

  for (const { line, pageNumber } of linesWithPages) {
    const trimmed = line.trim()
    const lineTokens = estimateTokens(trimmed)

    if (isSectionHeader(trimmed)) {
      flush()
      currentSection = trimmed
      currentLines.push(trimmed)
      currentPages.push(pageNumber)
      currentTokens += lineTokens
      continue
    }

    currentLines.push(line)
    currentPages.push(pageNumber)
    currentTokens += lineTokens

    if (currentTokens >= TARGET_CHUNK_TOKENS) {
      flush()
    }
  }

  flush()
  return chunks
}

export async function parseTextNativePdf(args: {
  fileUrl: string
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const pdfjs = await loadPdfJs()
  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  })

  const pdf = await loadingTask.promise

  try {
    const pageCount = pdf.numPages
    const sampleCount = Math.min(TEXT_NATIVE_SAMPLE_PAGES, pageCount)
    const sampleTexts: string[] = []
    let textRichPages = 0

    for (let pageNumber = 1; pageNumber <= sampleCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const text = await extractPageText(page)
      sampleTexts.push(text)
      if (text.trim().length >= TEXT_NATIVE_MIN_CHARS) {
        textRichPages += 1
      }
    }

    const isTextNative = textRichPages > Math.floor(sampleCount / 2)
    if (!isTextNative) {
      return {
        is_text_native: false,
        page_count: pageCount,
        pages: [],
        chunks: [],
      }
    }

    const pages: NativeParsedPage[] = []

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const text =
        pageNumber <= sampleTexts.length ? sampleTexts[pageNumber - 1] : await extractPageText(page)

      pages.push({
        page_number: pageNumber,
        text,
        ocr_confidence: 1,
        word_count: text ? text.split(/\s+/).filter(Boolean).length : 0,
        char_count: text.length,
      })
    }

    return {
      is_text_native: true,
      page_count: pageCount,
      pages,
      chunks: chunkPages(pages, {
        docType: args.docType,
        title: args.title,
        make: args.make,
        model: args.model,
      }),
    }
  } finally {
    await loadingTask.destroy()
  }
}

function sanitizePdfFilename(title: string) {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${base || 'document'}.pdf`
}

function normalizeConfidence(value: unknown, fallback = 0.65) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN

  if (Number.isFinite(numeric)) {
    return Math.min(1, Math.max(0, numeric))
  }

  return fallback
}

function parseConfidence(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
      ? Number.parseFloat(value)
      : Number.NaN

  if (!Number.isFinite(numeric)) return null
  return Math.min(1, Math.max(0, numeric))
}

function normalizeGeometryText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function extractDocumentAiBoundingRegion(args: {
  page: Record<string, unknown>
  layout: Record<string, unknown> | undefined
  pageNumber: number
  source: string
  kind: string
  confidence?: number | null
  text: string
  startIndex?: number | null
  endIndex?: number | null
}) {
  const dimension = (args.page.dimension as Record<string, unknown> | undefined) ?? {}
  const dimensionWidth = Number(dimension.width ?? Number.NaN)
  const dimensionHeight = Number(dimension.height ?? Number.NaN)
  const boundingPoly = (args.layout?.boundingPoly as Record<string, unknown> | undefined) ?? {}
  const normalizedVertices = Array.isArray(boundingPoly.normalizedVertices)
    ? (boundingPoly.normalizedVertices as Array<Record<string, unknown>>)
    : []
  const vertices = Array.isArray(boundingPoly.vertices)
    ? (boundingPoly.vertices as Array<Record<string, unknown>>)
    : []

  const resolvedVertices =
    normalizedVertices.length > 0
      ? normalizedVertices
          .map((vertex) => ({
            x: Number(vertex.x ?? 0),
            y: Number(vertex.y ?? 0),
          }))
          .filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))
      : vertices
          .map((vertex) => ({
            x:
              Number.isFinite(dimensionWidth) && dimensionWidth > 0
                ? Number(vertex.x ?? 0) / dimensionWidth
                : Number.NaN,
            y:
              Number.isFinite(dimensionHeight) && dimensionHeight > 0
                ? Number(vertex.y ?? 0) / dimensionHeight
                : Number.NaN,
          }))
          .filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))

  if (resolvedVertices.length === 0) return null

  const xs = resolvedVertices.map((vertex) => vertex.x)
  const ys = resolvedVertices.map((vertex) => vertex.y)
  const minX = Math.max(0, Math.min(...xs))
  const minY = Math.max(0, Math.min(...ys))
  const maxX = Math.min(1, Math.max(...xs))
  const maxY = Math.min(1, Math.max(...ys))

  return {
    text: args.text,
    normalized_text: normalizeGeometryText(args.text),
    page: args.pageNumber,
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    source: args.source,
    kind: args.kind,
    confidence: args.confidence ?? null,
    start_index: args.startIndex ?? null,
    end_index: args.endIndex ?? null,
  }
}

function extractDocumentAiTextSegments(textAnchor: unknown, fullTextLength: number) {
  const segments =
    textAnchor &&
    typeof textAnchor === 'object' &&
    Array.isArray((textAnchor as { textSegments?: unknown[] }).textSegments)
      ? ((textAnchor as { textSegments?: Array<{ startIndex?: unknown; endIndex?: unknown }> })
          .textSegments ?? [])
      : []

  return segments.map((segment) => ({
    startIndex: parseTextAnchorIndex(segment.startIndex, 0),
    endIndex: parseTextAnchorIndex(segment.endIndex, fullTextLength),
  }))
}

function extractDocumentAiGeometryRegions(args: {
  documentText: string
  page: Record<string, unknown>
  pageNumber: number
}) {
  const regions: NativePageGeometryRegion[] = []

  for (const key of ['lines', 'paragraphs', 'blocks']) {
    const entries = Array.isArray(args.page[key]) ? (args.page[key] as Array<Record<string, unknown>>) : []
    for (const entry of entries) {
      const layout = (entry.layout as Record<string, unknown> | undefined) ?? undefined
      const textAnchor = layout?.textAnchor
      const text = extractDocumentAiAnchorText(args.documentText, textAnchor)
      if (!text) continue

      const segments = extractDocumentAiTextSegments(textAnchor, args.documentText.length)
      const region = extractDocumentAiBoundingRegion({
        page: args.page,
        layout,
        pageNumber: args.pageNumber,
        source: 'google_document_ai',
        kind: key.slice(0, -1),
        confidence: parseConfidence(layout?.confidence),
        text,
        startIndex: segments[0]?.startIndex ?? null,
        endIndex: segments[segments.length - 1]?.endIndex ?? null,
      })

      if (region) {
        regions.push(region)
      }
    }
  }

  return regions
}

function extractTextractGeometryRegions(
  blocks: Array<{
    BlockType?: string
    Text?: string
    Page?: number
    Confidence?: number
    Geometry?: { BoundingBox?: { Left?: number; Top?: number; Width?: number; Height?: number } }
  }>,
  pageNumber: number
) {
  const regions: NativePageGeometryRegion[] = []

  for (const block of blocks) {
    if (block.Page !== pageNumber || block.BlockType !== 'LINE' || !block.Text) continue

    const box = block.Geometry?.BoundingBox
    if (!box) continue

    const left = Number(box.Left ?? Number.NaN)
    const top = Number(box.Top ?? Number.NaN)
    const width = Number(box.Width ?? Number.NaN)
    const height = Number(box.Height ?? Number.NaN)

    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) {
      continue
    }

    regions.push({
      text: block.Text,
      normalized_text: normalizeGeometryText(block.Text),
      page: pageNumber,
      x: Math.max(0, left),
      y: Math.max(0, top),
      width: Math.max(0, width),
      height: Math.max(0, height),
      source: 'aws_textract',
      kind: 'line',
      confidence: block.Confidence != null ? block.Confidence / 100 : null,
      start_index: null,
      end_index: null,
    })
  }

  return regions
}

function averageConfidence(values: Array<number | null | undefined>, fallback = 0.65) {
  const valid = values.filter((value): value is number => typeof value === 'number')
  if (valid.length === 0) return fallback
  return Math.min(1, Math.max(0, valid.reduce((sum, value) => sum + value, 0) / valid.length))
}

function createParsedPage(args: {
  pageNumber: number
  text: string
  confidence: number
  ocrEngine: string
  pageClassification?: string | null
  extractedEvent?: NativeExtractedEvent | null
  geometryRegions?: NativePageGeometryRegion[]
}): NativeParsedPage {
  const normalizedText = args.text.trim()
  return {
    page_number: args.pageNumber,
    text: normalizedText,
    ocr_confidence: normalizeConfidence(args.confidence, normalizedText ? 0.72 : 0.2),
    word_count: normalizedText ? normalizedText.split(/\s+/).filter(Boolean).length : 0,
    char_count: normalizedText.length,
    ocr_engine: args.ocrEngine,
    page_classification: args.pageClassification,
    extracted_event: args.extractedEvent,
    geometry_regions: args.geometryRegions ?? [],
  }
}

function normalizeClassification(value: unknown, docType: string, text: string) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (OCR_CLASSIFICATIONS.has(normalized)) return normalized
  if (!text.trim()) return 'blank'
  if (docType.toLowerCase().includes('logbook')) return 'maintenance_entry'
  return 'unknown'
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeOptionalBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === 'no') return false
  }
  return null
}

function normalizeExtractedEvent(
  value: unknown,
  pageText: string,
  fallbackConfidence: number
): NativeExtractedEvent | null {
  if (!value || typeof value !== 'object') return null

  const raw = value as Record<string, unknown>
  const event: NativeExtractedEvent = {
    event_type: normalizeOptionalString(raw.event_type),
    logbook_type: normalizeOptionalString(raw.logbook_type),
    event_date: normalizeOptionalString(raw.event_date),
    tach_time: normalizeOptionalString(raw.tach_time),
    airframe_tt: normalizeOptionalString(raw.airframe_tt),
    tsmoh: normalizeOptionalString(raw.tsmoh),
    work_description: normalizeOptionalString(raw.work_description),
    mechanic_name: normalizeOptionalString(raw.mechanic_name),
    mechanic_cert_number: normalizeOptionalString(raw.mechanic_cert_number),
    ia_number: normalizeOptionalString(raw.ia_number),
    ad_references: normalizeStringArray(raw.ad_references),
    part_numbers: normalizeStringArray(raw.part_numbers),
    return_to_service: normalizeOptionalBoolean(raw.return_to_service),
    confidence_overall: normalizeConfidence(raw.confidence_overall, fallbackConfidence),
  }

  const hasSignal = Boolean(
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
      (event.work_description && event.work_description.length > 0)
  )

  if (!hasSignal) {
    const trimmed = pageText.trim()
    if (!trimmed || trimmed.length < 80) return null
    return {
      work_description: trimmed.slice(0, 4000),
      confidence_overall: fallbackConfidence,
    }
  }

  if (!event.work_description && pageText.trim()) {
    event.work_description = pageText.trim().slice(0, 4000)
  }

  return event
}

async function annotateOcrPagesWithOpenAI(args: {
  pages: NativeParsedPage[]
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): Promise<NativeParsedPage[]> {
  if (!process.env.OPENAI_API_KEY || args.pages.length === 0) {
    return args.pages.map((page) => ({
      ...page,
      page_classification: normalizeClassification(page.page_classification, args.docType, page.text),
      extracted_event: page.extracted_event ?? null,
    }))
  }

  const aircraftContext = [args.make, args.model].filter(Boolean).join(' ').trim() || 'Unknown'
  const annotations = new Map<number, OcrTextAnnotationPage>()

  for (let startIndex = 0; startIndex < args.pages.length; startIndex += OCR_TEXT_ENRICH_BATCH_SIZE) {
    const batch = args.pages.slice(startIndex, startIndex + OCR_TEXT_ENRICH_BATCH_SIZE)
    const batchPrompt = batch
      .map(
        (page) =>
          `Page ${page.page_number}\n` +
          `OCR confidence: ${page.ocr_confidence}\n` +
          `${page.text.slice(0, OCR_TEXT_ENRICH_MAX_CHARS)}`
      )
      .join('\n\n---\n\n')

    const response = await withTimeout(getOpenAI().responses.create({
      model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0,
      max_output_tokens: OCR_MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: 'json_schema',
          name: 'ocr_page_annotations',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    page_number: { type: 'integer' },
                    page_classification: {
                      type: ['string', 'null'],
                      enum: [
                        'engine_log',
                        'airframe_log',
                        'prop_log',
                        'maintenance_entry',
                        'work_order',
                        'ad_compliance',
                        'cover',
                        'blank',
                        'unknown',
                        null,
                      ],
                    },
                    extracted_event: {
                      anyOf: [
                        { type: 'null' },
                        {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            event_type: { type: ['string', 'null'] },
                            logbook_type: { type: ['string', 'null'] },
                            event_date: { type: ['string', 'null'] },
                            tach_time: { type: ['string', 'null'] },
                            airframe_tt: { type: ['string', 'null'] },
                            tsmoh: { type: ['string', 'null'] },
                            work_description: { type: ['string', 'null'] },
                            mechanic_name: { type: ['string', 'null'] },
                            mechanic_cert_number: { type: ['string', 'null'] },
                            ia_number: { type: ['string', 'null'] },
                            ad_references: {
                              type: 'array',
                              items: { type: 'string' },
                            },
                            part_numbers: {
                              type: 'array',
                              items: { type: 'string' },
                            },
                            return_to_service: { type: ['boolean', 'null'] },
                            confidence_overall: { type: ['number', 'null'] },
                          },
                          required: [
                            'event_type',
                            'logbook_type',
                            'event_date',
                            'tach_time',
                            'airframe_tt',
                            'tsmoh',
                            'work_description',
                            'mechanic_name',
                            'mechanic_cert_number',
                            'ia_number',
                            'ad_references',
                            'part_numbers',
                            'return_to_service',
                            'confidence_overall',
                          ],
                        },
                      ],
                    },
                  },
                  required: ['page_number', 'page_classification', 'extracted_event'],
                },
              },
            },
            required: ['pages'],
          },
        },
      },
      input: [
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text:
                'You classify OCR text from aviation documents and extract structured maintenance fields. ' +
                'Use only the OCR text provided. Do not invent facts. ' +
                'Use page_classification values from: engine_log, airframe_log, prop_log, maintenance_entry, work_order, ad_compliance, cover, blank, unknown. ' +
                'Only return extracted_event when there is a real maintenance, logbook, or compliance entry on the page.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text:
                `Document title: ${args.title}\n` +
                `Aircraft context: ${aircraftContext}\n` +
                `Document type: ${args.docType}\n\n` +
                `Classify and extract these OCR pages:\n\n${batchPrompt}`,
            },
          ],
        },
      ],
    }),
    OCR_TEXT_ENRICH_TIMEOUT_MS,
    `OpenAI OCR annotation timed out after ${Math.round(OCR_TEXT_ENRICH_TIMEOUT_MS / 1000)}s`)

    const raw = response.output_text?.trim()
    if (!raw) continue

    const parsed = parseOpenAiJsonOutput<{ pages?: OcrTextAnnotationPage[] }>(raw)
    for (const entry of parsed.pages ?? []) {
      annotations.set(entry.page_number, entry)
    }
  }

  return args.pages.map((page) => {
    const annotation = annotations.get(page.page_number)
    const pageClassification = normalizeClassification(
      annotation?.page_classification ?? page.page_classification,
      args.docType,
      page.text
    )

    return {
      ...page,
      page_classification: pageClassification,
      extracted_event: normalizeExtractedEvent(
        annotation?.extracted_event ?? page.extracted_event,
        page.text,
        page.ocr_confidence
      ),
    }
  })
}

function buildScannedIngestResponse(args: {
  pageCount: number
  pages: NativeParsedPage[]
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): NativeIngestResponse {
  return {
    is_text_native: false,
    page_count: args.pageCount,
    pages: args.pages,
    chunks: chunkPages(
      args.pages.filter((page) => page.text.trim().length > 0),
      {
        docType: args.docType,
        title: args.title,
        make: args.make,
        model: args.model,
      }
    ),
  }
}

async function getDocumentAiAuthHeader(config: DocumentAiConfig) {
  const credentials = config.credentialsJson
    ? (JSON.parse(config.credentialsJson) as Record<string, unknown>)
    : undefined

  const auth = new GoogleAuth({
    credentials,
    keyFile: credentials ? undefined : config.credentialsPath,
    scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE],
  })

  const client = await auth.getClient()
  const headers = await client.getRequestHeaders()
  const authHeader = headers.get('authorization')

  if (!authHeader) {
    throw new Error('Document AI authentication headers could not be generated')
  }

  return authHeader
}

function parseTextAnchorIndex(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function extractDocumentAiAnchorText(documentText: string, textAnchor: unknown) {
  const segments =
    textAnchor &&
    typeof textAnchor === 'object' &&
    Array.isArray((textAnchor as { textSegments?: unknown[] }).textSegments)
      ? ((textAnchor as { textSegments?: Array<{ startIndex?: unknown; endIndex?: unknown }> })
          .textSegments ?? [])
      : []

  if (segments.length === 0) return ''

  return segments
    .map((segment) => {
      const startIndex = parseTextAnchorIndex(segment.startIndex, 0)
      const endIndex = parseTextAnchorIndex(segment.endIndex, documentText.length)
      return documentText.slice(startIndex, endIndex)
    })
    .join('')
    .trim()
}

function extractDocumentAiPageConfidence(page: Record<string, unknown>) {
  const confidences: Array<number | null> = [
    parseConfidence(page.confidence),
    parseConfidence((page.layout as { confidence?: unknown } | undefined)?.confidence),
    parseConfidence(
      (page.imageQualityScores as { qualityScore?: unknown } | undefined)?.qualityScore
    ),
  ]

  for (const key of ['tokens', 'paragraphs', 'blocks', 'lines']) {
    const entries = Array.isArray(page[key]) ? (page[key] as Array<Record<string, unknown>>) : []
    for (const entry of entries) {
      confidences.push(
        parseConfidence((entry.layout as { confidence?: unknown } | undefined)?.confidence)
      )
    }
  }

  return averageConfidence(confidences, 0.78)
}

async function parseScannedPdfWithDocumentAi(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  const config = getDocumentAiConfig()
  if (!config) {
    throw new Error('Document AI is not fully configured')
  }

  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const authHeader = await getDocumentAiAuthHeader(config)
  const endpoint =
    `https://${config.location}-documentai.googleapis.com/v1/` +
    `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}:process`

  const requestPayload = async (pdfChunkBytes: Uint8Array) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(DOCUMENT_AI_TIMEOUT_MS),
      body: JSON.stringify({
        skipHumanReview: true,
        processOptions: {
          schemaOverride: getDocumentAiSchemaOverride(),
        },
        rawDocument: {
          mimeType: 'application/pdf',
          content: Buffer.from(pdfChunkBytes).toString('base64'),
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`Document AI returned ${response.status}: ${await response.text()}`)
    }

    return (await response.json()) as DocumentAiProcessResponse
  }

  const buildPagesFromPayload = (
    payload: DocumentAiProcessResponse,
    pageCount: number,
    pageOffset: number
  ) => {
    const documentText = payload.document?.text ?? ''
    const pages = Array.isArray(payload.document?.pages) ? payload.document?.pages : []

    return Array.from({ length: pageCount }, (_, index) => {
      const page = (pages[index] as Record<string, unknown> | undefined) ?? {}
      const pageNumber = pageOffset + index + 1
      const layout = (page.layout as { textAnchor?: unknown } | undefined)?.textAnchor
      const text = extractDocumentAiAnchorText(documentText, layout)
      const confidence = extractDocumentAiPageConfidence(page)

      return createParsedPage({
        pageNumber,
        text,
        confidence,
        ocrEngine: 'google_document_ai',
        geometryRegions: extractDocumentAiGeometryRegions({
          documentText,
          page,
          pageNumber,
        }),
      })
    })
  }

  const buildChunkedPdfRequests = async () => {
    if (args.pageCount <= DOCUMENT_AI_MAX_PAGES_PER_REQUEST) {
      return [{ bytes: pdfBytes, pageOffset: 0, pageCount: args.pageCount }]
    }

    const sourcePdf = await PDFDocument.load(pdfBytes)
    const requests: Array<{ bytes: Uint8Array; pageOffset: number; pageCount: number }> = []

    for (let pageOffset = 0; pageOffset < args.pageCount; pageOffset += DOCUMENT_AI_MAX_PAGES_PER_REQUEST) {
      const chunkPageIndexes = Array.from(
        { length: Math.min(DOCUMENT_AI_MAX_PAGES_PER_REQUEST, args.pageCount - pageOffset) },
        (_, index) => pageOffset + index
      )
      const chunkPdf = await PDFDocument.create()
      const copiedPages = await chunkPdf.copyPages(sourcePdf, chunkPageIndexes)
      copiedPages.forEach((page) => chunkPdf.addPage(page))
      requests.push({
        bytes: await chunkPdf.save(),
        pageOffset,
        pageCount: chunkPageIndexes.length,
      })
    }

    return requests
  }

  const requestChunks = await buildChunkedPdfRequests()
  const basePages: NativeParsedPage[] = []

  for (const chunk of requestChunks) {
    const payload = await requestPayload(chunk.bytes)
    basePages.push(...buildPagesFromPayload(payload, chunk.pageCount, chunk.pageOffset))
  }

  const enrichedPages = await annotateOcrPagesWithOpenAI({
    pages: basePages,
    docType: args.docType,
    title: args.title,
    make: args.make,
    model: args.model,
  })

  return buildScannedIngestResponse({
    pageCount: args.pageCount,
    pages: enrichedPages,
    docType: args.docType,
    title: args.title,
    make: args.make,
    model: args.model,
  })
}

async function parseScannedPdfWithLocalOcr(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  const scriptPath = getLocalOcrScriptPath()
  if (!scriptPath) {
    throw new Error('Local OCR script is not configured')
  }

  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const tempFile = path.join(tmpdir(), `myaircraft-ocr-${randomUUID()}.pdf`)
  await writeFile(tempFile, pdfBytes)

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn('python3', [scriptPath, tempFile], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let output = ''
      let errorOutput = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, LOCAL_OCR_TIMEOUT_MS)

      child.stdout.on('data', (chunk) => {
        output += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        errorOutput += chunk.toString()
      })

      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(errorOutput.trim() || output.trim() || 'Local OCR failed'))
          return
        }
        resolve(output)
      })
    })

    const parsed = parseOpenAiJsonOutput<{
      pages?: Array<{ page_number?: number; text?: string; ocr_confidence?: number }>
    }>(stdout)
    const rawPages = Array.isArray(parsed.pages) ? parsed.pages : []

    const basePages = rawPages.map((page, index) => {
      const pageNumber = Number.isFinite(page.page_number) ? Number(page.page_number) : index + 1
      const text = typeof page.text === 'string' ? page.text : ''
      const confidence = typeof page.ocr_confidence === 'number' ? page.ocr_confidence : 0.55
      return createParsedPage({
        pageNumber,
        text,
        confidence,
        ocrEngine: 'local_tesseract',
      })
    })

    const enrichedPages = await annotateOcrPagesWithOpenAI({
      pages: basePages,
      docType: args.docType,
      title: args.title,
      make: args.make,
      model: args.model,
    })

    return buildScannedIngestResponse({
      pageCount: args.pageCount,
      pages: enrichedPages,
      docType: args.docType,
      title: args.title,
      make: args.make,
      model: args.model,
    })
  } finally {
    await unlink(tempFile).catch(() => {})
  }
}

async function parseScannedPdfWithTextract(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  if (!hasTextractConfig()) {
    throw new Error('Textract is not configured')
  }

  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const region = getTrimmedEnvValue('AWS_REGION')
  const accessKeyId = getTrimmedEnvValue('AWS_ACCESS_KEY_ID')
  const secretAccessKey = getTrimmedEnvValue('AWS_SECRET_ACCESS_KEY')

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('Textract is not configured')
  }

  const client = new TextractClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })

  const response = await withTimeout(
    client.send(
      new DetectDocumentTextCommand({
        Document: {
          Bytes: pdfBytes,
        },
      })
    ),
    TEXTRACT_TIMEOUT_MS,
    `Textract OCR timed out after ${Math.round(TEXTRACT_TIMEOUT_MS / 1000)}s`
  )

  const linesByPage = new Map<number, string[]>()
  const confidencesByPage = new Map<number, number[]>()

  for (const block of response.Blocks ?? []) {
    const pageNumber = block.Page ?? 1
    if (!linesByPage.has(pageNumber)) linesByPage.set(pageNumber, [])
    if (!confidencesByPage.has(pageNumber)) confidencesByPage.set(pageNumber, [])

    if ((block.BlockType === 'LINE' || block.BlockType === 'WORD') && block.Text) {
      linesByPage.get(pageNumber)!.push(block.Text)
    }

    if ((block.BlockType === 'LINE' || block.BlockType === 'WORD') && block.Confidence != null) {
      confidencesByPage.get(pageNumber)!.push(block.Confidence / 100)
    }
  }

  const basePages = Array.from({ length: args.pageCount }, (_, index) => {
    const pageNumber = index + 1
    const text = (linesByPage.get(pageNumber) ?? []).join('\n').trim()
    const confidence = averageConfidence(confidencesByPage.get(pageNumber) ?? [], text ? 0.76 : 0.2)

    return createParsedPage({
      pageNumber,
      text,
      confidence,
      ocrEngine: 'aws_textract',
      geometryRegions: extractTextractGeometryRegions(response.Blocks ?? [], pageNumber),
    })
  })

  const enrichedPages = await annotateOcrPagesWithOpenAI({
    pages: basePages,
    docType: args.docType,
    title: args.title,
    make: args.make,
    model: args.model,
  })

  return buildScannedIngestResponse({
    pageCount: args.pageCount,
    pages: enrichedPages,
    docType: args.docType,
    title: args.title,
    make: args.make,
    model: args.model,
  })
}

async function runScannedOcrBatch(args: {
  fileId: string
  pageCount: number
  startPage: number
  endPage: number
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): Promise<NativeParsedPage[]> {
  const aircraftContext = [args.make, args.model].filter(Boolean).join(' ').trim() || 'Unknown'
  const response = await withTimeout(getOpenAI().responses.create({
    model: process.env.OPENAI_OCR_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    temperature: 0,
    max_output_tokens: OCR_MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: 'json_schema',
        name: 'ocr_batch_pages',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            pages: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  page_number: { type: 'integer' },
                  text: { type: 'string' },
                  ocr_confidence: { type: 'number' },
                  page_classification: {
                    type: ['string', 'null'],
                    enum: [
                      'engine_log',
                      'airframe_log',
                      'prop_log',
                      'maintenance_entry',
                      'work_order',
                      'ad_compliance',
                      'cover',
                      'blank',
                      'unknown',
                      null,
                    ],
                  },
                  extracted_event: {
                    anyOf: [
                      { type: 'null' },
                      {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                          event_type: { type: ['string', 'null'] },
                          logbook_type: { type: ['string', 'null'] },
                          event_date: { type: ['string', 'null'] },
                          tach_time: { type: ['string', 'null'] },
                          airframe_tt: { type: ['string', 'null'] },
                          tsmoh: { type: ['string', 'null'] },
                          work_description: { type: ['string', 'null'] },
                          mechanic_name: { type: ['string', 'null'] },
                          mechanic_cert_number: { type: ['string', 'null'] },
                          ia_number: { type: ['string', 'null'] },
                          ad_references: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                          part_numbers: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                          return_to_service: { type: ['boolean', 'null'] },
                          confidence_overall: { type: ['number', 'null'] },
                        },
                        required: [
                          'event_type',
                          'logbook_type',
                          'event_date',
                          'tach_time',
                          'airframe_tt',
                          'tsmoh',
                          'work_description',
                          'mechanic_name',
                          'mechanic_cert_number',
                          'ia_number',
                          'ad_references',
                          'part_numbers',
                          'return_to_service',
                          'confidence_overall',
                        ],
                      },
                    ],
                  },
                },
                required: [
                  'page_number',
                  'text',
                  'ocr_confidence',
                  'page_classification',
                  'extracted_event',
                ],
              },
            },
          },
          required: ['pages'],
        },
      },
    },
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text:
              'You perform aviation-document OCR and page-level maintenance extraction. ' +
              'For each requested page, preserve the page text as faithfully as possible. Do not skip pages. ' +
              'Use 0-1 confidence values. Keep page_classification to one of: engine_log, airframe_log, prop_log, maintenance_entry, work_order, ad_compliance, cover, blank, unknown. ' +
              'Only populate extracted_event when the page contains a real maintenance/logbook entry or compliance-relevant record.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            file_id: args.fileId,
          },
          {
            type: 'input_text',
            text:
              `Document title: ${args.title}\n` +
              `Aircraft context: ${aircraftContext}\n` +
              `Document type: ${args.docType}\n` +
              `This PDF has ${args.pageCount} pages.\n` +
              `Return OCR results only for pages ${args.startPage}-${args.endPage} inclusive.\n\n` +
              'Return JSON with this exact shape:\n' +
              '{\n' +
              '  "pages": [\n' +
              '    {\n' +
              '      "page_number": 1,\n' +
              '      "text": "string",\n' +
              '      "ocr_confidence": 0.0,\n' +
              '      "page_classification": "unknown",\n' +
              '      "extracted_event": {\n' +
              '        "event_type": "string|null",\n' +
              '        "logbook_type": "string|null",\n' +
              '        "event_date": "YYYY-MM-DD|null",\n' +
              '        "tach_time": "string|null",\n' +
              '        "airframe_tt": "string|null",\n' +
              '        "tsmoh": "string|null",\n' +
              '        "work_description": "string|null",\n' +
              '        "mechanic_name": "string|null",\n' +
              '        "mechanic_cert_number": "string|null",\n' +
              '        "ia_number": "string|null",\n' +
              '        "ad_references": ["string"],\n' +
              '        "part_numbers": ["string"],\n' +
              '        "return_to_service": true,\n' +
              '        "confidence_overall": 0.0\n' +
              '      }\n' +
              '    }\n' +
              '  ]\n' +
              '}\n\n' +
              'If a page is blank or unreadable, return an empty text string, low confidence, classification "blank" or "unknown", and extracted_event null.',
          },
        ],
      },
    ],
  }),
  OPENAI_OCR_BATCH_TIMEOUT_MS,
  `OpenAI PDF OCR timed out after ${Math.round(OPENAI_OCR_BATCH_TIMEOUT_MS / 1000)}s for pages ${args.startPage}-${args.endPage}`)

  const raw = response.output_text?.trim()
  if (!raw) {
    throw new Error(`OpenAI OCR returned no content for pages ${args.startPage}-${args.endPage}`)
  }

  const parsed = parseOpenAiJsonOutput<{ pages?: OcrBatchResultPage[] }>(raw)
  const rawPages = Array.isArray(parsed.pages) ? parsed.pages : []
  const requestedPages = new Map<number, NativeParsedPage>()

  for (const pageNumber of Array.from(
    { length: args.endPage - args.startPage + 1 },
    (_, offset) => args.startPage + offset
  )) {
    const rawPage = rawPages.find((entry) => entry.page_number === pageNumber)
    const text = typeof rawPage?.text === 'string' ? rawPage.text.trim() : ''
    const confidence = normalizeConfidence(rawPage?.ocr_confidence, text ? 0.72 : 0.2)
    requestedPages.set(pageNumber, {
      page_number: pageNumber,
      text,
      ocr_confidence: confidence,
      word_count: text ? text.split(/\s+/).filter(Boolean).length : 0,
      char_count: text.length,
      page_classification: normalizeClassification(rawPage?.page_classification, args.docType, text),
      extracted_event: normalizeExtractedEvent(rawPage?.extracted_event, text, confidence),
      geometry_regions: [],
    })
  }

  return Array.from(requestedPages.values()).sort((a, b) => a.page_number - b.page_number)
}

async function runScannedOcrBatchAdaptive(args: {
  fileId: string
  pageCount: number
  startPage: number
  endPage: number
  docType: string
  title: string
  make?: string | null
  model?: string | null
}): Promise<NativeParsedPage[]> {
  try {
    return await runScannedOcrBatch(args)
  } catch (error) {
    const pageSpan = args.endPage - args.startPage

    if (pageSpan <= 0 || !isRecoverableJsonParseError(error)) {
      throw error
    }

    const midpoint = args.startPage + Math.floor(pageSpan / 2)
    const left = await runScannedOcrBatchAdaptive({
      ...args,
      endPage: midpoint,
    })
    const right = await runScannedOcrBatchAdaptive({
      ...args,
      startPage: midpoint + 1,
    })

    return [...left, ...right]
  }
}

export async function parseScannedPdfWithOpenAI(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for scanned PDF OCR')
  }

  const pdfBytes = await downloadPdfBytes(args.fileUrl)
  const upload = await withTimeout(
    getOpenAI().files.create({
      file: await toFile(Buffer.from(pdfBytes), sanitizePdfFilename(args.title)),
      purpose: 'assistants',
    }),
    OPENAI_FILE_UPLOAD_TIMEOUT_MS,
    `OpenAI OCR upload timed out after ${Math.round(OPENAI_FILE_UPLOAD_TIMEOUT_MS / 1000)}s`
  )

  try {
    const pages: NativeParsedPage[] = []

    for (let startPage = 1; startPage <= args.pageCount; startPage += OCR_BATCH_SIZE) {
      const endPage = Math.min(args.pageCount, startPage + OCR_BATCH_SIZE - 1)
      const batchPages = await runScannedOcrBatchAdaptive({
        fileId: upload.id,
        pageCount: args.pageCount,
        startPage,
        endPage,
        docType: args.docType,
        title: args.title,
        make: args.make,
        model: args.model,
      })

      pages.push(...batchPages)
    }

    return buildScannedIngestResponse({
      pageCount: args.pageCount,
      pages: pages.map((page) => ({
        ...page,
        ocr_engine: 'openai_pdf_ocr',
      })),
      docType: args.docType,
      title: args.title,
      make: args.make,
      model: args.model,
    })
  } finally {
    await getOpenAI()
      .files.del(upload.id)
      .catch((error) => {
        console.warn('[ingestion] failed to delete temporary OpenAI OCR file', error)
      })
  }
}

export async function parseScannedPdfWithFallbacks(args: {
  fileUrl: string
  docType: string
  title: string
  pageCount: number
  make?: string | null
  model?: string | null
}): Promise<NativeIngestResponse> {
  const attempts: Array<{
    name: string
    enabled: boolean
    run: () => Promise<NativeIngestResponse>
  }> = [
    {
      name: 'google_document_ai',
      enabled: Boolean(getDocumentAiConfig()),
      run: () => parseScannedPdfWithDocumentAi(args),
    },
    {
      name: 'local_tesseract',
      enabled: hasLocalOcrConfig(),
      run: () => parseScannedPdfWithLocalOcr(args),
    },
    {
      name: 'openai_pdf_ocr',
      enabled: Boolean(process.env.OPENAI_API_KEY),
      run: () => parseScannedPdfWithOpenAI(args),
    },
    {
      name: 'aws_textract',
      enabled: isTextractEnabled(),
      run: () => parseScannedPdfWithTextract(args),
    },
  ]

  const errors: string[] = []

  if (!attempts.some((attempt) => attempt.enabled)) {
    throw new OcrNotConfiguredError('No OCR engine is configured for scanned PDF ingestion')
  }

  for (const attempt of attempts) {
    if (!attempt.enabled) continue

    try {
      const result = await attempt.run()
      if (result.chunks.length > 0 || result.pages.some((page) => page.text.trim().length > 0)) {
        return result
      }

      errors.push(`${attempt.name}: returned no usable OCR text`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${attempt.name}: ${message}`)
    }
  }

  throw new Error(
    errors.length > 0
      ? `No OCR engine succeeded. ${errors.join(' | ')}`
      : 'No OCR engine is configured for scanned PDF ingestion'
  )
}

function inferMetadataCategory(docType: string) {
  const normalized = docType.toLowerCase()
  if (normalized.includes('logbook')) return 'logbook'
  if (normalized === 'poh' || normalized === 'afm' || normalized === 'afm_supplement') {
    return 'poh_afm'
  }
  if (normalized === 'airworthiness_directive' || normalized === 'service_bulletin') {
    return 'ad_sb'
  }
  return null
}

export async function extractMetadataInline(args: {
  docType: string
  make?: string | null
  model?: string | null
  chunks: Array<{
    chunk_index: number
    page_number: number
    page_number_end?: number
    section_title?: string
    display_text?: string
    text_for_embedding?: string
  }>
}): Promise<NativeMetadataResponse | null> {
  const category = inferMetadataCategory(args.docType)
  if (!category || args.chunks.length === 0 || !process.env.OPENAI_API_KEY) {
    return null
  }

  const excerpts = args.chunks
    .slice(0, 20)
    .map(
      (chunk) =>
        `Chunk ${chunk.chunk_index} (pages ${chunk.page_number}-${chunk.page_number_end ?? chunk.page_number}, section: ${chunk.section_title ?? 'General'})\n${chunk.display_text ?? chunk.text_for_embedding ?? ''}`
    )
    .join('\n\n---\n\n')

  const aircraftContext = [args.make, args.model].filter(Boolean).join(' ').trim() || 'Unknown'
  const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o'

  let schemaDescription = ''
  if (category === 'logbook') {
    schemaDescription =
      '{"maintenance_events":[{"date":"string|null","type":"string|null","description":"string|null","mechanic":"string|null","airframe_tt":"string|null","ad_reference":"string|null"}],"tail_numbers":["string"],"serial_numbers":["string"],"engine_serial_numbers":["string"]}'
  } else if (category === 'poh_afm') {
    schemaDescription =
      '{"revision":"string|null","effective_date":"string|null","aircraft_models_applicable":["string"],"faa_approval_number":"string|null"}'
  } else {
    schemaDescription =
      '{"ad_number":"string|null","sb_number":"string|null","subject":"string|null","effective_date":"string|null","compliance_date":"string|null","affected_models":["string"],"compliance_method":"string|null"}'
  }

  try {
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You extract structured aviation document metadata from provided text excerpts. Return only valid JSON. Do not invent facts not grounded in the excerpts. Use null or empty arrays when unknown.',
        },
        {
          role: 'user',
          content:
            `Document type: ${args.docType}\nAircraft context: ${aircraftContext}\n` +
            `Return a JSON object that matches this shape exactly: ${schemaDescription}\n\n` +
            `Use only the evidence below:\n\n${excerpts}`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (category === 'logbook') {
      return {
        metadata: {
          logbook: {
            maintenance_events: Array.isArray(parsed.maintenance_events)
              ? parsed.maintenance_events
              : [],
            tail_numbers: Array.isArray(parsed.tail_numbers) ? parsed.tail_numbers : [],
            serial_numbers: Array.isArray(parsed.serial_numbers) ? parsed.serial_numbers : [],
            engine_serial_numbers: Array.isArray(parsed.engine_serial_numbers)
              ? parsed.engine_serial_numbers
              : [],
          },
        },
      }
    }

    if (category === 'poh_afm') {
      return {
        metadata: {
          poh_afm: {
            revision: typeof parsed.revision === 'string' ? parsed.revision : null,
            effective_date:
              typeof parsed.effective_date === 'string' ? parsed.effective_date : null,
            aircraft_models_applicable: Array.isArray(parsed.aircraft_models_applicable)
              ? parsed.aircraft_models_applicable
              : [],
            faa_approval_number:
              typeof parsed.faa_approval_number === 'string' ? parsed.faa_approval_number : null,
          },
        },
      }
    }

    return {
      metadata: {
        ad_sb: {
          ad_number: typeof parsed.ad_number === 'string' ? parsed.ad_number : null,
          sb_number: typeof parsed.sb_number === 'string' ? parsed.sb_number : null,
          subject: typeof parsed.subject === 'string' ? parsed.subject : null,
          effective_date:
            typeof parsed.effective_date === 'string' ? parsed.effective_date : null,
          compliance_date:
            typeof parsed.compliance_date === 'string' ? parsed.compliance_date : null,
          affected_models: Array.isArray(parsed.affected_models) ? parsed.affected_models : [],
          compliance_method:
            typeof parsed.compliance_method === 'string' ? parsed.compliance_method : null,
        },
      },
    }
  } catch (error) {
    console.warn('[ingestion] inline metadata extraction skipped', error)
    return null
  }
}
