/**
 * Sprint 8.5 — hybrid retriever tests.
 *
 * The text retriever (/lib/rag/retrieval.ts) is mocked — these tests
 * NEVER call the sacred pipeline. The vision query helpers are also
 * mocked so we don't need a live supabase client.
 *
 * Coverage:
 *   - org-isolation: orgId is forwarded to retrieveChunks AND to the
 *     vision-pages lookup
 *   - mode='text': vision helpers NOT called
 *   - mode='vision': retrieveChunks NOT called
 *   - mode='hybrid': both called, scores combined per VISION_TEXT_WEIGHT
 *   - VISION_TEXT_WEIGHT env override
 *   - top-k respected
 *   - empty result sets handled cleanly
 *   - stub query embedding generators are deterministic
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  stubQuerySummary,
  stubQueryVectorTokens,
  stubTextQueryEmbedding,
} from './retriever'

// ─── Stub-generator tests (no mocks) ─────────────────────────────────

describe('stubQuerySummary', () => {
  it('produces a 128-dim vector', () => {
    expect(stubQuerySummary('any query')).toHaveLength(128)
  })

  it('every value is a finite float in [-1, 1]', () => {
    const v = stubQuerySummary('any query')
    for (const x of v) {
      expect(Number.isFinite(x)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(1)
    }
  })

  it('deterministic — same query yields same vector', () => {
    expect(stubQuerySummary('q')).toEqual(stubQuerySummary('q'))
  })

  it('different queries yield different vectors', () => {
    expect(stubQuerySummary('q1')).not.toEqual(stubQuerySummary('q2'))
  })
})

describe('stubQueryVectorTokens', () => {
  it('default 16 tokens × 128 dim', () => {
    const t = stubQueryVectorTokens('q')
    expect(t).toHaveLength(16)
    expect(t[0]).toHaveLength(128)
  })

  it('respects custom count', () => {
    expect(stubQueryVectorTokens('q', 4)).toHaveLength(4)
  })

  it('each token differs from the next (separately seeded)', () => {
    const t = stubQueryVectorTokens('q', 4)
    expect(t[0]).not.toEqual(t[1])
    expect(t[1]).not.toEqual(t[2])
  })
})

describe('stubTextQueryEmbedding', () => {
  it('produces a 1536-dim vector (matches OpenAI text-embedding-3-large)', () => {
    expect(stubTextQueryEmbedding('q')).toHaveLength(1536)
  })

  it('deterministic', () => {
    expect(stubTextQueryEmbedding('q')).toEqual(stubTextQueryEmbedding('q'))
  })
})

// ─── hybridRetrieve orchestration tests ──────────────────────────────

vi.mock('@/lib/rag/retrieval', () => ({
  retrieveChunks: vi.fn(),
}))

vi.mock('./index-query', () => ({
  searchVisionIndex: vi.fn(),
  getPatchVectors: vi.fn(),
}))

import { hybridRetrieve } from './retriever'
import { retrieveChunks } from '@/lib/rag/retrieval'
import { searchVisionIndex, getPatchVectors } from './index-query'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.VISION_TEXT_WEIGHT
})

function makeChunk(docId: string, page: number, score = 0.7) {
  return {
    chunk_id: `chunk-${docId}-${page}`,
    document_id: docId,
    document_title: 'doc',
    doc_type: 'logbook',
    page_number: page,
    chunk_text: `Snippet for ${docId} page ${page}`,
    metadata_json: {},
    vector_score: score,
    keyword_score: score,
    combined_score: score,
  } as any
}

function mockSupabase(opts: {
  visionPagesLookup?: Array<{ id: string; source_document_id: string; page_number: number }>
} = {}) {
  return {
    from: (table: string) => {
      if (table === 'vision_pages') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({
                data: opts.visionPagesLookup ?? [],
                error: null,
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  } as any
}

describe('hybridRetrieve — mode=text', () => {
  it('does NOT call vision helpers', async () => {
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.9),
      makeChunk('doc-1', 1, 0.5),
    ])

    await hybridRetrieve(mockSupabase(), 'org-A', 'tail number', { mode: 'text' })

    expect(retrieveChunks).toHaveBeenCalledOnce()
    expect(searchVisionIndex).not.toHaveBeenCalled()
    expect(getPatchVectors).not.toHaveBeenCalled()
  })

  it('combined score equals text score', async () => {
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.9),
    ])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q', { mode: 'text' })
    expect(r[0].score_combined).toBeCloseTo(0.9, 10)
    expect(r[0].score_vision).toBe(0)
  })
})

describe('hybridRetrieve — mode=vision', () => {
  it('does NOT call retrieveChunks', async () => {
    ;(searchVisionIndex as any).mockResolvedValue([])

    await hybridRetrieve(mockSupabase(), 'org-A', 'q', { mode: 'vision' })

    expect(retrieveChunks).not.toHaveBeenCalled()
    expect(searchVisionIndex).toHaveBeenCalledOnce()
  })

  it('combined score equals vision score', async () => {
    ;(searchVisionIndex as any).mockResolvedValue([
      { vision_page_id: 'vp-1', summary_score: 0.85, model_used: 'colqwen2-stub', embedding_dim: 128, vision_index_id: 'vp-1' },
    ])
    ;(getPatchVectors as any).mockResolvedValue({ patches: [], embedding_dim: 128, patch_count: 0 })

    const supabase = mockSupabase({
      visionPagesLookup: [{ id: 'vp-1', source_document_id: 'doc-1', page_number: 0 }],
    })

    const r = await hybridRetrieve(supabase, 'org-A', 'q', { mode: 'vision' })
    expect(r).toHaveLength(1)
    expect(r[0].score_text).toBe(0)
    // Empty patches → vision falls back to summary score 0.85.
    expect(r[0].score_vision).toBeCloseTo(0.85, 10)
    expect(r[0].score_combined).toBeCloseTo(0.85, 10)
  })
})

describe('hybridRetrieve — mode=hybrid (default)', () => {
  it('combines text + vision via 0.6/0.4 weights by default', async () => {
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.5),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([
      { vision_page_id: 'vp-1', summary_score: 1.0, model_used: 'm', embedding_dim: 128, vision_index_id: 'vp-1' },
    ])
    ;(getPatchVectors as any).mockResolvedValue({ patches: [], embedding_dim: 128, patch_count: 0 })

    const supabase = mockSupabase({
      visionPagesLookup: [{ id: 'vp-1', source_document_id: 'doc-1', page_number: 0 }],
    })

    const r = await hybridRetrieve(supabase, 'org-A', 'q')
    // 0.6 × 0.5 + 0.4 × 1.0 = 0.7
    expect(r[0].score_combined).toBeCloseTo(0.7, 10)
  })

  it('respects VISION_TEXT_WEIGHT env override', async () => {
    process.env.VISION_TEXT_WEIGHT = '0.2'
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.5),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([
      { vision_page_id: 'vp-1', summary_score: 1.0, model_used: 'm', embedding_dim: 128, vision_index_id: 'vp-1' },
    ])
    ;(getPatchVectors as any).mockResolvedValue({ patches: [], embedding_dim: 128, patch_count: 0 })

    const supabase = mockSupabase({
      visionPagesLookup: [{ id: 'vp-1', source_document_id: 'doc-1', page_number: 0 }],
    })

    const r = await hybridRetrieve(supabase, 'org-A', 'q')
    // 0.2 × 0.5 + 0.8 × 1.0 = 0.9
    expect(r[0].score_combined).toBeCloseTo(0.9, 10)
  })

  it('opts.textWeight overrides env', async () => {
    process.env.VISION_TEXT_WEIGHT = '0.2'
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 1.0),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q', { textWeight: 1.0 })
    // textWeight=1 → only text counts
    expect(r[0].score_combined).toBeCloseTo(1.0, 10)
  })

  it('rejects out-of-range textWeight via clamping (env-side)', async () => {
    process.env.VISION_TEXT_WEIGHT = '99'  // invalid → falls through to default 0.6
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 1.0),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q')
    // Default weight 0.6 used since env value invalid
    expect(r[0].score_combined).toBeCloseTo(0.6, 10)
  })
})

describe('hybridRetrieve — top-k truncation + sorting', () => {
  it('returns at most k results, sorted by combined desc', async () => {
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.1),
      makeChunk('doc-2', 0, 0.9),
      makeChunk('doc-3', 0, 0.5),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q', { mode: 'text', k: 2 })
    expect(r).toHaveLength(2)
    expect(r[0].source_document_id).toBe('doc-2')
    expect(r[1].source_document_id).toBe('doc-3')
  })
})

describe('hybridRetrieve — org isolation', () => {
  it('forwards orgId to retrieveChunks', async () => {
    ;(retrieveChunks as any).mockResolvedValue([])
    ;(searchVisionIndex as any).mockResolvedValue([])

    await hybridRetrieve(mockSupabase(), 'org-test-123', 'q')

    expect(retrieveChunks).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-test-123',
    }))
  })

  it('forwards orgId to searchVisionIndex', async () => {
    ;(retrieveChunks as any).mockResolvedValue([])
    ;(searchVisionIndex as any).mockResolvedValue([])

    await hybridRetrieve(mockSupabase(), 'org-test-456', 'q')

    expect(searchVisionIndex).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      organization_id: 'org-test-456',
    }))
  })
})

describe('hybridRetrieve — empty result sets', () => {
  it('empty text + empty vision → empty results', async () => {
    ;(retrieveChunks as any).mockResolvedValue([])
    ;(searchVisionIndex as any).mockResolvedValue([])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q')
    expect(r).toEqual([])
  })

  it('only-text result + no vision matches → text-only output', async () => {
    ;(retrieveChunks as any).mockResolvedValue([
      makeChunk('doc-1', 0, 0.7),
    ])
    ;(searchVisionIndex as any).mockResolvedValue([])

    const r = await hybridRetrieve(mockSupabase(), 'org-A', 'q')
    expect(r).toHaveLength(1)
    // hybrid mode: 0.6 × 0.7 + 0.4 × 0 = 0.42
    expect(r[0].score_combined).toBeCloseTo(0.42, 10)
    expect(r[0].score_vision).toBe(0)
  })
})
