import { describe, expect, it } from 'vitest'
import {
  buildAnswerCitationFromChunk,
  enrichAnswerCitationsWithAnchors,
  normalizeSearchTextWithMap,
} from '@/lib/rag/citation-anchors'
import type { RetrievedChunk } from '@/types'

class QueryBuilderStub<T> {
  constructor(private readonly rows: T[]) {}

  select() {
    return this
  }

  in() {
    return this
  }

  order() {
    return this
  }

  then<TResult1 = { data: T[] }, TResult2 = never>(
    onFulfilled?: ((value: { data: T[] }) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve({ data: this.rows }).then(onFulfilled, onRejected)
  }
}

function createSupabaseStub(args: { documentPages?: unknown[]; ocrSegments?: unknown[] }) {
  return {
    from(table: string) {
      if (table === 'document_pages') {
        return new QueryBuilderStub(args.documentPages ?? [])
      }

      if (table === 'ocr_entry_segments') {
        return new QueryBuilderStub(args.ocrSegments ?? [])
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function createChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    chunk_id: 'chunk-1',
    document_id: 'doc-1',
    document_title: 'Cessna 172 Service Manual',
    doc_type: 'service_manual',
    page_number: 20,
    page_number_end: 20,
    section_title: 'EACH 100 HOURS',
    chunk_text:
      'Clean or replace the carburetor air filter, lubricate the nose gear torque links, and drain sediment from the fuel tank sump drains.',
    metadata_json: {},
    vector_score: 0.91,
    keyword_score: 0.88,
    combined_score: 0.9,
    ...overrides,
  }
}

describe('normalizeSearchTextWithMap', () => {
  it('normalizes text and preserves a char map for anchor reconstruction', () => {
    const result = normalizeSearchTextWithMap('Fuel   Tank\nSump Drains')

    expect(result.text).toBe('fuel tank sump drains')
    expect(result.map[0]).toBe(0)
    expect(result.map[result.map.length - 1]).toBeGreaterThan(0)
  })
})

describe('enrichAnswerCitationsWithAnchors', () => {
  it('creates an exact text anchor for text-native citations', async () => {
    const chunk = createChunk()
    const citation = buildAnswerCitationFromChunk(chunk)
    const supabase = createSupabaseStub({
      documentPages: [
        {
          document_id: 'doc-1',
          page_number: 20,
          page_text:
            'Reduce periods of prolonged operation in dusty areas. Clean or replace the carburetor air filter, lubricate the nose gear torque links, and drain sediment from the fuel tank sump drains.',
        },
      ],
      ocrSegments: [],
    })

    const [enriched] = await enrichAnswerCitationsWithAnchors({
      citations: [citation],
      retrievedChunks: [chunk],
      supabase: supabase as never,
    })

    expect(enriched.isExactAnchor).toBe(true)
    expect(enriched.matchStrategy).toBe('page_text_exact')
    expect(enriched.textAnchorStart).toBeTypeOf('number')
    expect(enriched.textAnchorEnd).toBeTypeOf('number')
    expect(enriched.quotedText).toContain('carburetor air filter')
  })

  it('prefers OCR segment geometry when available for scanned chunks', async () => {
    const chunk = createChunk({
      chunk_id: 'chunk-ocr',
      document_id: 'doc-ocr',
      doc_type: 'logbook',
      page_number: 4,
      metadata_json: { is_ocr: true },
      chunk_text:
        'Replaced left magneto, timed engine, and returned aircraft to service after operational check.',
    })
    const citation = buildAnswerCitationFromChunk(chunk)
    const supabase = createSupabaseStub({
      documentPages: [],
      ocrSegments: [
        {
          id: 'segment-1',
          document_id: 'doc-ocr',
          page_number: 4,
          text_content:
            'Replaced left magneto, timed engine, and returned aircraft to service after operational check.',
          normalized_text:
            'replaced left magneto timed engine and returned aircraft to service after operational check',
          excerpt_text:
            'Replaced left magneto, timed engine, and returned aircraft to service after operational check.',
          bounding_regions: [
            {
              page: 4,
              x: 0.15,
              y: 0.32,
              width: 0.66,
              height: 0.11,
              source: 'document_ai_line',
              kind: 'line',
            },
          ],
          confidence: 0.93,
          segment_type: 'maintenance_entry',
        },
      ],
    })

    const [enriched] = await enrichAnswerCitationsWithAnchors({
      citations: [citation],
      retrievedChunks: [chunk],
      supabase: supabase as never,
    })

    expect(enriched.isExactAnchor).toBe(true)
    expect(enriched.matchStrategy).toBe('ocr_segment_exact')
    expect(enriched.boundingRegions).toHaveLength(1)
    expect(enriched.boundingRegions?.[0].source).toBe('document_ai_line')
  })

  it('falls back gracefully when only page-level OCR geometry exists', async () => {
    const chunk = createChunk({
      chunk_id: 'chunk-ocr-fallback',
      document_id: 'doc-ocr-fallback',
      doc_type: 'logbook',
      page_number: 7,
      metadata_json: { is_ocr: true },
    })
    const citation = buildAnswerCitationFromChunk(chunk)
    const supabase = createSupabaseStub({
      documentPages: [],
      ocrSegments: [
        {
          id: 'segment-1',
          document_id: 'doc-ocr-fallback',
          page_number: 7,
          text_content: chunk.chunk_text,
          normalized_text: chunk.chunk_text.toLowerCase(),
          excerpt_text: chunk.chunk_text,
          bounding_regions: [
            {
              page: 7,
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              source: 'page_fallback',
            },
          ],
          confidence: 0.8,
          segment_type: 'maintenance_entry',
        },
      ],
    })

    const [enriched] = await enrichAnswerCitationsWithAnchors({
      citations: [citation],
      retrievedChunks: [chunk],
      supabase: supabase as never,
    })

    expect(enriched.pageNumber).toBe(7)
    expect(enriched.isExactAnchor).toBe(false)
    expect(enriched.matchStrategy).toMatch(/ocr_segment/)
  })
})
