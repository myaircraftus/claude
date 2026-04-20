import { createServiceSupabase } from '@/lib/supabase/server'
import type { AnswerCitation, CitationBoundingRegion, RetrievedChunk } from '@/types'

type ServiceClient = ReturnType<typeof createServiceSupabase>

interface DocumentPageRow {
  document_id: string
  page_number: number
  page_text: string | null
}

interface OcrEntrySegmentRow {
  id: string
  document_id: string
  page_number: number
  text_content: string | null
  normalized_text: string | null
  excerpt_text: string | null
  bounding_regions: unknown
  confidence: number | null
  segment_type: string
}

interface LocatedTextAnchor {
  pageNumber: number
  textAnchorStart: number
  textAnchorEnd: number
  quotedText: string
  normalizedQuotedText: string
  matchStrategy: string
}

interface LocatedSegmentAnchor {
  pageNumber: number
  quotedText: string
  normalizedQuotedText: string
  boundingRegions: CitationBoundingRegion[]
  matchStrategy: string
  isExactAnchor: boolean
}

interface NormalizedTextWithMap {
  text: string
  map: number[]
}

function stripTrailingEllipsis(value: string) {
  return value.replace(/…$/g, '').replace(/\.\.\.$/g, '').trim()
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function buildAnchorCandidates(citation: AnswerCitation) {
  const snippet = stripTrailingEllipsis(citation.snippet)
  const quotedText = stripTrailingEllipsis(citation.quotedText ?? '')
  const sentenceLikeParts = snippet
    .split(/(?:\n|(?<=[.?!;:]))\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 40)
    .sort((left, right) => right.length - left.length)

  const candidates = uniqueStrings([
    quotedText,
    snippet,
    snippet.length > 220 ? snippet.slice(0, 220).trim() : undefined,
    snippet.length > 140 ? snippet.slice(0, 140).trim() : undefined,
    sentenceLikeParts[0],
  ])

  return candidates.filter((candidate) => candidate.length >= 18)
}

export function normalizeSearchTextWithMap(value: string): NormalizedTextWithMap {
  const map: number[] = []
  let normalized = ''
  let lastWasSpace = true

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    const lower = char.toLowerCase()

    if (/[a-z0-9]/.test(lower)) {
      normalized += lower
      map.push(index)
      lastWasSpace = false
      continue
    }

    if (/\s/.test(char) && !lastWasSpace && normalized.length > 0) {
      normalized += ' '
      map.push(index)
      lastWasSpace = true
    }
  }

  if (normalized.endsWith(' ')) {
    normalized = normalized.slice(0, -1)
    map.pop()
  }

  return { text: normalized, map }
}

function findTextAnchorInPage(pageText: string, candidates: string[]): Omit<LocatedTextAnchor, 'pageNumber'> | null {
  if (!pageText.trim()) return null

  const exactHaystack = pageText
  const lowercaseHaystack = pageText.toLowerCase()
  const normalizedHaystack = normalizeSearchTextWithMap(pageText)

  for (const candidate of candidates.sort((left, right) => right.length - left.length)) {
    const cleanCandidate = stripTrailingEllipsis(candidate)
    if (cleanCandidate.length < 18) continue

    const exactIndex = exactHaystack.indexOf(cleanCandidate)
    if (exactIndex >= 0) {
      return {
        textAnchorStart: exactIndex,
        textAnchorEnd: exactIndex + cleanCandidate.length,
        quotedText: exactHaystack.slice(exactIndex, exactIndex + cleanCandidate.length),
        normalizedQuotedText: normalizeSearchTextWithMap(cleanCandidate).text,
        matchStrategy: 'page_text_exact',
      }
    }

    const caseInsensitiveIndex = lowercaseHaystack.indexOf(cleanCandidate.toLowerCase())
    if (caseInsensitiveIndex >= 0) {
      return {
        textAnchorStart: caseInsensitiveIndex,
        textAnchorEnd: caseInsensitiveIndex + cleanCandidate.length,
        quotedText: exactHaystack.slice(caseInsensitiveIndex, caseInsensitiveIndex + cleanCandidate.length),
        normalizedQuotedText: normalizeSearchTextWithMap(cleanCandidate).text,
        matchStrategy: 'page_text_case_insensitive',
      }
    }

    const normalizedCandidate = normalizeSearchTextWithMap(cleanCandidate).text
    if (!normalizedCandidate) continue

    const normalizedIndex = normalizedHaystack.text.indexOf(normalizedCandidate)
    if (normalizedIndex >= 0) {
      const start = normalizedHaystack.map[normalizedIndex] ?? 0
      const endMapIndex = normalizedIndex + normalizedCandidate.length - 1
      const end = (normalizedHaystack.map[endMapIndex] ?? start) + 1
      return {
        textAnchorStart: start,
        textAnchorEnd: end,
        quotedText: exactHaystack.slice(start, end),
        normalizedQuotedText: normalizedCandidate,
        matchStrategy: 'page_text_normalized',
      }
    }
  }

  return null
}

function normalizeLooseText(value: string | null | undefined) {
  return normalizeSearchTextWithMap(value ?? '').text
}

function scoreSegmentText(segmentText: string, candidate: string) {
  const normalizedSegment = normalizeLooseText(segmentText)
  const normalizedCandidate = normalizeLooseText(candidate)

  if (!normalizedSegment || !normalizedCandidate) return 0
  if (normalizedSegment.includes(normalizedCandidate)) {
    return 1 + normalizedCandidate.length / Math.max(normalizedSegment.length, 1)
  }
  if (normalizedCandidate.includes(normalizedSegment)) {
    return 0.8 + normalizedSegment.length / Math.max(normalizedCandidate.length, 1)
  }

  const candidateTokens = new Set(normalizedCandidate.split(' ').filter((token) => token.length >= 3))
  if (candidateTokens.size === 0) return 0

  const overlapCount = Array.from(candidateTokens).filter((token) => normalizedSegment.includes(token)).length
  return overlapCount / candidateTokens.size
}

function toBoundingRegion(value: unknown): CitationBoundingRegion | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  const page = Number(raw.page ?? 0)
  const x = Number(raw.x ?? Number.NaN)
  const y = Number(raw.y ?? Number.NaN)
  const width = Number(raw.width ?? Number.NaN)
  const height = Number(raw.height ?? Number.NaN)

  if (!Number.isFinite(page) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }

  return {
    page,
    x,
    y,
    width,
    height,
    source: typeof raw.source === 'string' ? raw.source : null,
    kind: typeof raw.kind === 'string' ? raw.kind : null,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
  }
}

function sanitizeBoundingRegions(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => toBoundingRegion(entry))
    .filter((entry): entry is CitationBoundingRegion => Boolean(entry))
}

function hasNonFallbackBoundingRegion(regions: CitationBoundingRegion[]) {
  return regions.some((region) => region.source !== 'page_fallback')
}

function findBestSegmentAnchor(segments: OcrEntrySegmentRow[], candidates: string[]): LocatedSegmentAnchor | null {
  let bestMatch: LocatedSegmentAnchor | null = null
  let bestScore = 0

  for (const segment of segments) {
    const segmentText = segment.normalized_text ?? segment.text_content ?? segment.excerpt_text ?? ''
    for (const candidate of candidates) {
      const score = scoreSegmentText(segmentText, candidate)
      if (score <= bestScore || score < 0.45) continue

      const boundingRegions = sanitizeBoundingRegions(segment.bounding_regions)
      bestScore = score
      bestMatch = {
        pageNumber: segment.page_number,
        quotedText: segment.excerpt_text ?? stripTrailingEllipsis(candidate),
        normalizedQuotedText: normalizeLooseText(segment.excerpt_text ?? candidate),
        boundingRegions,
        matchStrategy: score >= 1 ? 'ocr_segment_exact' : 'ocr_segment_overlap',
        isExactAnchor: hasNonFallbackBoundingRegion(boundingRegions),
      }
    }
  }

  return bestMatch
}

function mapRowsByDocumentAndPage<T extends { document_id: string; page_number: number }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const key = `${row.document_id}:${row.page_number}`
    const existing = map.get(key)
    if (existing) existing.push(row)
    else map.set(key, [row])
  }
  return map
}

export function buildAnswerCitationFromChunk(chunk: RetrievedChunk): AnswerCitation {
  const snippet = chunk.chunk_text.length > 300 ? `${chunk.chunk_text.slice(0, 297)}...` : chunk.chunk_text
  const normalizedSnippet = normalizeLooseText(snippet)

  return {
    chunkId: chunk.chunk_id,
    documentId: chunk.document_id,
    documentTitle: chunk.document_title,
    docType: chunk.doc_type,
    pageNumber: chunk.page_number,
    pageNumberEnd: chunk.page_number_end,
    sectionTitle: chunk.section_title,
    snippet,
    quotedText: snippet,
    normalizedQuotedText: normalizedSnippet || undefined,
    matchStrategy: 'chunk_snippet',
    textAnchorStart: null,
    textAnchorEnd: null,
    boundingRegions: [],
    isExactAnchor: false,
    relevanceScore: chunk.combined_score,
  }
}

export async function enrichAnswerCitationsWithAnchors(args: {
  citations: AnswerCitation[]
  retrievedChunks: RetrievedChunk[]
  supabase?: ServiceClient
}) {
  if (args.citations.length === 0) return args.citations

  const supabase = args.supabase ?? createServiceSupabase()
  const chunkById = new Map(args.retrievedChunks.map((chunk) => [chunk.chunk_id, chunk]))
  const documentIds = uniqueStrings(args.citations.map((citation) => citation.documentId))

  const [{ data: pageRows }, { data: segmentRows }] = await Promise.all([
    supabase
      .from('document_pages')
      .select('document_id, page_number, page_text')
      .in('document_id', documentIds)
      .order('page_number', { ascending: true }),
    supabase
      .from('ocr_entry_segments')
      .select('id, document_id, page_number, text_content, normalized_text, excerpt_text, bounding_regions, confidence, segment_type')
      .in('document_id', documentIds)
      .order('page_number', { ascending: true })
      .order('segment_index', { ascending: true }),
  ])

  const pagesByDocumentAndPage = mapRowsByDocumentAndPage(
    ((pageRows as DocumentPageRow[] | null) ?? []).filter((row) => typeof row.page_number === 'number')
  )
  const segmentsByDocumentAndPage = mapRowsByDocumentAndPage(
    ((segmentRows as OcrEntrySegmentRow[] | null) ?? []).filter((row) => typeof row.page_number === 'number')
  )

  return args.citations.map((citation) => {
    const chunk = chunkById.get(citation.chunkId)
    const pageStart = citation.pageNumber
    const pageEnd = citation.pageNumberEnd ?? chunk?.page_number_end ?? citation.pageNumber
    const candidates = buildAnchorCandidates(citation)

    if (candidates.length === 0) {
      return {
        ...citation,
        pageNumberEnd: pageEnd,
        matchStrategy: citation.matchStrategy ?? 'page_fallback',
        isExactAnchor: citation.isExactAnchor ?? false,
      }
    }

    const relevantSegments: OcrEntrySegmentRow[] = []
    const relevantPages: DocumentPageRow[] = []

    for (let pageNumber = pageStart; pageNumber <= pageEnd; pageNumber += 1) {
      relevantSegments.push(...(segmentsByDocumentAndPage.get(`${citation.documentId}:${pageNumber}`) ?? []))
      relevantPages.push(...(pagesByDocumentAndPage.get(`${citation.documentId}:${pageNumber}`) ?? []))
    }

    const isOcrChunk = Boolean(chunk?.metadata_json?.is_ocr)
    if (isOcrChunk) {
      const segmentAnchor = findBestSegmentAnchor(relevantSegments, candidates)
      if (segmentAnchor) {
        return {
          ...citation,
          pageNumber: segmentAnchor.pageNumber,
          pageNumberEnd: segmentAnchor.pageNumber,
          quotedText: segmentAnchor.quotedText,
          normalizedQuotedText: segmentAnchor.normalizedQuotedText,
          matchStrategy: segmentAnchor.matchStrategy,
          boundingRegions: segmentAnchor.boundingRegions,
          isExactAnchor: segmentAnchor.isExactAnchor,
          textAnchorStart: null,
          textAnchorEnd: null,
        }
      }
    }

    for (const page of relevantPages) {
      const textAnchor = findTextAnchorInPage(page.page_text ?? '', candidates)
      if (textAnchor) {
        return {
          ...citation,
          pageNumber: page.page_number,
          pageNumberEnd: page.page_number,
          quotedText: textAnchor.quotedText,
          normalizedQuotedText: textAnchor.normalizedQuotedText,
          matchStrategy: textAnchor.matchStrategy,
          textAnchorStart: textAnchor.textAnchorStart,
          textAnchorEnd: textAnchor.textAnchorEnd,
          boundingRegions: [],
          isExactAnchor: true,
        }
      }
    }

    const fallbackSegment = findBestSegmentAnchor(relevantSegments, candidates)
    if (fallbackSegment) {
      return {
        ...citation,
        pageNumber: fallbackSegment.pageNumber,
        pageNumberEnd: fallbackSegment.pageNumber,
        quotedText: fallbackSegment.quotedText,
        normalizedQuotedText: fallbackSegment.normalizedQuotedText,
        matchStrategy: fallbackSegment.matchStrategy,
        boundingRegions: fallbackSegment.boundingRegions,
        isExactAnchor: fallbackSegment.isExactAnchor,
      }
    }

    return {
      ...citation,
      pageNumberEnd: pageEnd,
      matchStrategy: citation.matchStrategy ?? 'page_fallback',
      isExactAnchor: citation.isExactAnchor ?? false,
    }
  })
}
