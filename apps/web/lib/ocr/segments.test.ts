import { describe, expect, it } from 'vitest'
import { buildOcrEntrySegments } from '@/lib/ocr/segments'

describe('buildOcrEntrySegments', () => {
  it('attaches real geometry matches when segment text maps to OCR regions', () => {
    const [segment] = buildOcrEntrySegments({
      documentId: 'doc-1',
      docType: 'logbook',
      pages: [
        {
          page_number: 1,
          text: 'Replaced left magneto and returned aircraft to service.',
          ocr_confidence: 0.93,
          ocr_engine: 'document_ai',
          page_classification: 'maintenance_entry',
          geometry_regions: [
            {
              text: 'Replaced left magneto and returned aircraft to service.',
              normalized_text:
                'replaced left magneto and returned aircraft to service',
              page: 1,
              x: 0.12,
              y: 0.28,
              width: 0.62,
              height: 0.1,
              source: 'document_ai_line',
              kind: 'line',
            },
          ],
        },
      ],
    })

    expect(segment.canonicalCandidate).toBe(true)
    expect(segment.evidenceState).toBe('canonical_candidate')
    expect(segment.boundingRegions[0]).toMatchObject({
      page: 1,
      source: 'document_ai_line',
      x: 0.12,
      y: 0.28,
    })
  })

  it('suppresses manuals from canonical truth even when OCR is confident', () => {
    const [segment] = buildOcrEntrySegments({
      documentId: 'manual-1',
      docType: 'maintenance_manual',
      pages: [
        {
          page_number: 12,
          text: 'Section 5. Each 100 hours inspect carburetor air filter and drain sump.',
          ocr_confidence: 0.97,
          ocr_engine: 'document_ai',
          page_classification: 'manual_reference',
          geometry_regions: [],
        },
      ],
    })

    expect(segment.evidenceState).toBe('informational_only')
    expect(segment.canonicalCandidate).toBe(false)
    expect(segment.suppressionReason).toBe('manual_reference')
  })

  it('links continuation segments across page boundaries', () => {
    const segments = buildOcrEntrySegments({
      documentId: 'doc-2',
      docType: 'logbook',
      pages: [
        {
          page_number: 3,
          text: 'Changed oil and filter, inspected screens, continued on next page',
          ocr_confidence: 0.82,
          ocr_engine: 'document_ai',
          page_classification: 'maintenance_entry',
          geometry_regions: [],
        },
        {
          page_number: 4,
          text: 'Continued from previous page. Returned aircraft to service after leak check.',
          ocr_confidence: 0.82,
          ocr_engine: 'document_ai',
          page_classification: 'maintenance_entry',
          geometry_regions: [],
        },
      ],
    })

    expect(segments).toHaveLength(2)
    expect(segments[0].crossPageContinuation).toBe(true)
    expect(segments[1].crossPageContinuation).toBe(true)
    expect(segments[0].segmentGroupKey).toBe(segments[1].segmentGroupKey)
  })
})
