type DocumentFamily =
  | 'logbook'
  | 'manual_reference'
  | 'ad_sb'
  | 'work_order'
  | 'inspection'
  | 'general'

export type OcrSegmentType =
  | 'maintenance_entry'
  | 'signoff_block'
  | 'header_template_block'
  | 'attached_tag'
  | 'inserted_form'
  | 'informational_reference_block'
  | 'table_block'
  | 'diagram_graph_block'
  | 'ignore_block'

export type OcrEvidenceState =
  | 'canonical_candidate'
  | 'informational_only'
  | 'non_canonical_evidence'
  | 'review_required'
  | 'ignore'

export interface SegmentablePage {
  page_number: number
  text: string
  ocr_confidence?: number
  ocr_engine?: string | null
  page_classification?: string | null
  geometry_regions?: Array<{
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
  }>
}

export interface ParsedOcrSegment {
  pageNumber: number
  segmentIndex: number
  sortOrder: number
  segmentType: OcrSegmentType
  evidenceState: OcrEvidenceState
  textContent: string
  normalizedText: string
  excerptText: string
  confidence: number
  sourceEngine: string
  canonicalCandidate: boolean
  suppressionReason: string | null
  crossPageContinuation: boolean
  segmentGroupKey: string
  previousLocalKey?: string | null
  nextLocalKey?: string | null
  localKey: string
  boundingRegions: Array<Record<string, unknown>>
  metadataJson: Record<string, unknown>
}

const DATE_HEADING_RE =
  /(^|\n)\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\w+\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})\b/g
const SIGNOFF_RE =
  /(returned?\s+to\s+service|approved\s+for\s+return|i\s+certify|signature|cert(ificate)?\s*(no|#)|a&p|inspection authorization|\bia\b)/i
const CONTINUE_RE = /(continued\s+(on|to)\s+next\s+page|cont(?:inued)?\.?\s*$)/i
const CONTINUED_FROM_RE = /^(continued\s+from|cont(?:inued)?\.?)/i
const HEADER_RE = /^(page\s+\d+|date\b|tach\b|tt\b|aircraft\b|engine\b|prop\b|model\b|serial\b)/i
const TABLE_HINT_RE = /\b(table|hours|cycles|serial|model|part\s+number|p\/n|s\/n)\b/i
const DIAGRAM_HINT_RE = /\b(figure|diagram|graph|illustration|schematic)\b/i
const TAG_HINT_RE = /\b(8130|yellow\s+tag|tag\s+number|serviceable|overhauled)\b/i
const FORM_HINT_RE = /\b(form\s*337|faa\s*337|faa\s*form|8130-3)\b/i
const MANUAL_HINT_RE = /\b(section|chapter|procedure|inspection\s+check\s+list|servicing\s+intervals)\b/i

function normalizeText(value: string) {
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
}

function buildExcerpt(text: string) {
  return normalizeText(text).slice(0, 500)
}

function scoreGeometryRegion(segmentText: string, regionText: string) {
  const normalizedSegment = normalizeText(segmentText).toLowerCase()
  const normalizedRegion = normalizeText(regionText).toLowerCase()

  if (!normalizedSegment || !normalizedRegion) return 0
  if (normalizedSegment.includes(normalizedRegion)) {
    return 1 + normalizedRegion.length / Math.max(normalizedSegment.length, 1)
  }
  if (normalizedRegion.includes(normalizedSegment)) {
    return 0.9 + normalizedSegment.length / Math.max(normalizedRegion.length, 1)
  }

  const tokens = new Set(normalizedRegion.split(' ').filter((token) => token.length >= 3))
  if (tokens.size === 0) return 0
  const overlap = Array.from(tokens).filter((token) => normalizedSegment.includes(token)).length
  return overlap / tokens.size
}

function findBoundingRegionsForSegment(
  segmentText: string,
  page: SegmentablePage
): Array<Record<string, unknown>> {
  const regions = page.geometry_regions ?? []
  if (regions.length === 0) {
    return [{ page: page.page_number, source: 'page_fallback', x: 0, y: 0, width: 1, height: 1 }]
  }

  const matchedRegions = regions
    .map((region) => ({
      region,
      score: scoreGeometryRegion(segmentText, region.text),
    }))
    .filter((entry) => entry.score >= 0.45)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map(({ region }) => ({
      page: region.page,
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      source: region.source,
      kind: region.kind,
      confidence: region.confidence ?? null,
    }))

  return matchedRegions.length > 0
    ? matchedRegions
    : [{ page: page.page_number, source: 'page_fallback', x: 0, y: 0, width: 1, height: 1 }]
}

function inferDocumentFamily(docType: string): DocumentFamily {
  const normalized = docType.toLowerCase()
  if (normalized.includes('logbook')) return 'logbook'
  if (
    normalized === 'maintenance_manual' ||
    normalized === 'service_manual' ||
    normalized === 'parts_catalog' ||
    normalized === 'poh' ||
    normalized === 'afm' ||
    normalized === 'afm_supplement'
  ) {
    return 'manual_reference'
  }
  if (normalized === 'airworthiness_directive' || normalized === 'service_bulletin') return 'ad_sb'
  if (normalized === 'work_order') return 'work_order'
  if (normalized === 'inspection_report') return 'inspection'
  return 'general'
}

function splitIntoBlocks(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return []

  const paragraphBlocks = trimmed
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (paragraphBlocks.length > 1) return paragraphBlocks

  const matches = Array.from(trimmed.matchAll(DATE_HEADING_RE))
  if (matches.length > 1) {
    const blocks: string[] = []
    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index ?? 0
      const end = matches[index + 1]?.index ?? trimmed.length
      const block = trimmed.slice(start, end).trim()
      if (block) blocks.push(block)
    }
    if (blocks.length > 0) return blocks
  }

  return [trimmed]
}

function detectSegmentType(text: string, pageClassification: string | null | undefined): OcrSegmentType {
  const normalized = text.trim()
  if (!normalized) return 'ignore_block'
  if (FORM_HINT_RE.test(normalized)) return 'inserted_form'
  if (TAG_HINT_RE.test(normalized)) return 'attached_tag'
  if (DIAGRAM_HINT_RE.test(normalized)) return 'diagram_graph_block'
  if (TABLE_HINT_RE.test(normalized) && normalized.split('\n').length >= 3) return 'table_block'
  if (SIGNOFF_RE.test(normalized) && normalized.length < 1200) return 'signoff_block'
  if (HEADER_RE.test(normalized) && normalized.length < 220) return 'header_template_block'

  if (
    pageClassification === 'maintenance_entry' ||
    pageClassification === 'engine_log' ||
    pageClassification === 'airframe_log' ||
    pageClassification === 'prop_log'
  ) {
    return 'maintenance_entry'
  }

  if (MANUAL_HINT_RE.test(normalized)) return 'informational_reference_block'
  return 'maintenance_entry'
}

function detectEvidenceState(args: {
  documentFamily: DocumentFamily
  segmentType: OcrSegmentType
  text: string
  confidence: number
}) {
  if (!args.text.trim()) {
    return {
      evidenceState: 'ignore' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: 'blank_segment',
    }
  }

  if (args.segmentType === 'ignore_block' || args.confidence < 0.4) {
    return {
      evidenceState: 'ignore' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: args.confidence < 0.4 ? 'low_confidence' : 'ignored_block',
    }
  }

  if (args.documentFamily === 'manual_reference') {
    return {
      evidenceState: 'informational_only' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: 'manual_reference',
    }
  }

  if (args.segmentType === 'diagram_graph_block' || args.segmentType === 'table_block') {
    return {
      evidenceState: 'non_canonical_evidence' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: 'non_narrative_block',
    }
  }

  if (args.segmentType === 'header_template_block') {
    return {
      evidenceState: 'ignore' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: 'template_or_header',
    }
  }

  if (args.documentFamily === 'ad_sb') {
    return {
      evidenceState: 'non_canonical_evidence' as OcrEvidenceState,
      canonicalCandidate: false,
      suppressionReason: 'ad_reference_source',
    }
  }

  if (args.documentFamily === 'work_order' || args.documentFamily === 'inspection') {
    return {
      evidenceState: args.confidence >= 0.82 ? ('canonical_candidate' as OcrEvidenceState) : ('review_required' as OcrEvidenceState),
      canonicalCandidate: args.confidence >= 0.82,
      suppressionReason: args.confidence >= 0.82 ? null : 'review_needed',
    }
  }

  if (args.documentFamily === 'logbook') {
    return {
      evidenceState:
        args.segmentType === 'maintenance_entry' || args.segmentType === 'signoff_block' || args.segmentType === 'attached_tag'
          ? (args.confidence >= 0.72 ? 'canonical_candidate' : 'review_required')
          : ('review_required' as OcrEvidenceState),
      canonicalCandidate:
        args.confidence >= 0.72 &&
        (args.segmentType === 'maintenance_entry' || args.segmentType === 'signoff_block' || args.segmentType === 'attached_tag'),
      suppressionReason: args.confidence >= 0.72 ? null : 'review_needed',
    }
  }

  return {
    evidenceState: 'review_required' as OcrEvidenceState,
    canonicalCandidate: false,
    suppressionReason: 'unknown_document_family',
  }
}

export function buildOcrEntrySegments(args: {
  documentId: string
  docType: string
  pages: SegmentablePage[]
}): ParsedOcrSegment[] {
  const documentFamily = inferDocumentFamily(args.docType)
  const segments: ParsedOcrSegment[] = []
  let pendingContinuationGroup: string | null = null
  let previousLocalKey: string | null = null

  for (const page of args.pages) {
    const confidence = typeof page.ocr_confidence === 'number' ? page.ocr_confidence : 0.65
    const blocks = splitIntoBlocks(page.text)

    if (blocks.length === 0) {
      const localKey = `${page.page_number}:0`
      segments.push({
        pageNumber: page.page_number,
        segmentIndex: 0,
        sortOrder: page.page_number * 1000,
        segmentType: 'ignore_block',
        evidenceState: 'ignore',
        textContent: '',
        normalizedText: '',
        excerptText: '',
        confidence,
        sourceEngine: page.ocr_engine ?? 'unknown',
        canonicalCandidate: false,
        suppressionReason: 'blank_page',
        crossPageContinuation: false,
        segmentGroupKey: `${args.documentId}:${page.page_number}:0`,
        previousLocalKey,
        nextLocalKey: null,
        localKey,
        boundingRegions: findBoundingRegionsForSegment('', page),
        metadataJson: {
          page_classification: page.page_classification ?? 'blank',
          document_family: documentFamily,
        },
      })
      previousLocalKey = localKey
      continue
    }

    blocks.forEach((block, blockIndex) => {
      const normalized = normalizeText(block)
      const segmentType = detectSegmentType(block, page.page_classification)
      const continuationFromPrev = Boolean(
        pendingContinuationGroup && (blockIndex === 0 || CONTINUED_FROM_RE.test(normalized))
      )
      const segmentGroupKey =
        continuationFromPrev && pendingContinuationGroup
          ? pendingContinuationGroup
          : `${args.documentId}:${page.page_number}:${blockIndex}`
      const continuationToNext = CONTINUE_RE.test(normalized)
      const state = detectEvidenceState({
        documentFamily,
        segmentType,
        text: normalized,
        confidence,
      })
      const localKey = `${page.page_number}:${blockIndex}`

      segments.push({
        pageNumber: page.page_number,
        segmentIndex: blockIndex,
        sortOrder: page.page_number * 1000 + blockIndex,
        segmentType,
        evidenceState: state.evidenceState,
        textContent: block.trim(),
        normalizedText: normalized,
        excerptText: buildExcerpt(block),
        confidence,
        sourceEngine: page.ocr_engine ?? 'unknown',
        canonicalCandidate: state.canonicalCandidate,
        suppressionReason: state.suppressionReason,
        crossPageContinuation: continuationFromPrev || continuationToNext,
        segmentGroupKey,
        previousLocalKey,
        nextLocalKey: null,
        localKey,
        boundingRegions: findBoundingRegionsForSegment(block, page),
        metadataJson: {
          page_classification: page.page_classification ?? 'unknown',
          document_family: documentFamily,
          continuation_from_previous: continuationFromPrev,
          continuation_to_next: continuationToNext,
        },
      })

      pendingContinuationGroup = continuationToNext ? segmentGroupKey : null
      previousLocalKey = localKey
    })
  }

  const byLocalKey = new Map(segments.map((segment) => [segment.localKey, segment]))
  for (const segment of segments) {
    if (segment.previousLocalKey) {
      const previous = byLocalKey.get(segment.previousLocalKey)
      if (previous) {
        previous.nextLocalKey = segment.localKey
      }
    }
  }

  return segments
}
