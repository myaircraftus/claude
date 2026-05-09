/**
 * Sprint 8.4 — vision index query helper tests.
 *
 * Covers:
 *   - stubVectorsForPage determinism + shape + bounded values
 *   - insertVisionEmbedding dim-mismatch guard
 *   - searchVisionIndex dim-mismatch guard + org-scoping
 *   - getPatchVectors org-scoping + null on not-found
 *   - SearchQuerySchema rejects out-of-shape queries
 */
import { describe, it, expect } from 'vitest'
import {
  stubVectorsForPage,
  insertVisionEmbedding,
  searchVisionIndex,
  getPatchVectors,
  SearchQuerySchema,
} from './index-query'

// ─── stubVectorsForPage (pure function) ──────────────────────────────

describe('stubVectorsForPage', () => {
  it('produces 128-dim summary vector', () => {
    const v = stubVectorsForPage('page-A')
    expect(v.summary_vector).toHaveLength(128)
    expect(v.embedding_dim).toBe(128)
  })

  it('produces 64 patches × 128 dim each', () => {
    const v = stubVectorsForPage('page-A')
    expect(v.patch_vectors.patches).toHaveLength(64)
    for (const p of v.patch_vectors.patches) {
      expect(p).toHaveLength(128)
    }
  })

  it('every value is a finite float in [-1, 1]', () => {
    const v = stubVectorsForPage('page-A')
    for (const x of v.summary_vector) {
      expect(Number.isFinite(x)).toBe(true)
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(1)
    }
    for (const patch of v.patch_vectors.patches) {
      for (const x of patch) {
        expect(Number.isFinite(x)).toBe(true)
        expect(x).toBeGreaterThanOrEqual(-1)
        expect(x).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic (same page id → same vectors)', () => {
    const v1 = stubVectorsForPage('page-A')
    const v2 = stubVectorsForPage('page-A')
    expect(v1.summary_vector).toEqual(v2.summary_vector)
    expect(v1.patch_vectors.patches[0]).toEqual(v2.patch_vectors.patches[0])
  })

  it('produces different vectors for different page ids', () => {
    const v1 = stubVectorsForPage('page-A')
    const v2 = stubVectorsForPage('page-B')
    expect(v1.summary_vector).not.toEqual(v2.summary_vector)
  })

  it('summary vector and first patch differ (separately seeded)', () => {
    const v = stubVectorsForPage('page-X')
    expect(v.summary_vector).not.toEqual(v.patch_vectors.patches[0])
  })
})

// ─── insertVisionEmbedding dim-mismatch guard ────────────────────────

describe('insertVisionEmbedding', () => {
  it('rejects when summary_vector length ≠ embedding_dim', async () => {
    const fakeSupabase = {
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: async () => ({ data: { id: 'x' }, error: null }),
          }),
        }),
      }),
    } as any

    await expect(insertVisionEmbedding(fakeSupabase, {
      organization_id: 'org-A',
      vision_page_id: 'page-1',
      model_used: 'colqwen2-stub',
      embedding_dim: 128,
      summary_vector: [0.1, 0.2],   // length 2 ≠ 128
      patch_vectors: { patches: [] },
    })).rejects.toThrow(/length.*≠/)
  })

  it('accepts a matching dim', async () => {
    let upsertCalled = false
    const fakeSupabase = {
      from: () => ({
        upsert: (row: any) => {
          upsertCalled = true
          // patch_count derived from patches.length
          expect(row.patch_count).toBe(row.patch_vectors.patches.length)
          return {
            select: () => ({
              single: async () => ({ data: { id: 'new-id' }, error: null }),
            }),
          }
        },
      }),
    } as any

    const v = stubVectorsForPage('page-A')
    const r = await insertVisionEmbedding(fakeSupabase, {
      organization_id: 'org-A',
      vision_page_id: 'page-A',
      model_used: 'colqwen2-stub',
      embedding_dim: v.embedding_dim,
      summary_vector: v.summary_vector,
      patch_vectors: v.patch_vectors,
    })

    expect(r.id).toBe('new-id')
    expect(upsertCalled).toBe(true)
  })
})

// ─── searchVisionIndex ───────────────────────────────────────────────

describe('searchVisionIndex', () => {
  it('rejects query_vector with wrong dim', async () => {
    await expect(searchVisionIndex({} as any, {
      organization_id: 'org-A',
      query_vector: [0.1, 0.2],
    })).rejects.toThrow(/length.*≠ expected 128/)
  })

  it('filters by organization_id (RLS defense-in-depth)', async () => {
    let recordedFilter: { col: string; val: string } | null = null
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: (col: string, val: string) => {
            recordedFilter = { col, val }
            return {
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }
          },
        }),
      }),
    } as any

    const v = stubVectorsForPage('page-A')
    await searchVisionIndex(fakeSupabase, {
      organization_id: 'org-A',
      query_vector: v.summary_vector,
    })
    expect(recordedFilter).toEqual({ col: 'organization_id', val: 'org-A' })
  })

  it('caps results at k', async () => {
    let recordedK: number | null = null
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: (n: number) => {
                recordedK = n
                return Promise.resolve({ data: [], error: null })
              },
            }),
          }),
        }),
      }),
    } as any

    const v = stubVectorsForPage('page-A')
    await searchVisionIndex(fakeSupabase, {
      organization_id: 'org-A',
      query_vector: v.summary_vector,
      k: 7,
    })
    expect(recordedK).toBe(7)
  })

  it('default k = 10', async () => {
    let recordedK: number | null = null
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: (n: number) => {
                recordedK = n
                return Promise.resolve({ data: [], error: null })
              },
            }),
          }),
        }),
      }),
    } as any
    const v = stubVectorsForPage('page-A')
    await searchVisionIndex(fakeSupabase, {
      organization_id: 'org-A',
      query_vector: v.summary_vector,
    })
    expect(recordedK).toBe(10)
  })

  it('produces monotonically-decreasing summary_score (placeholder)', async () => {
    const rows = [
      { vision_page_id: 'p1', model_used: 'm', embedding_dim: 128 },
      { vision_page_id: 'p2', model_used: 'm', embedding_dim: 128 },
      { vision_page_id: 'p3', model_used: 'm', embedding_dim: 128 },
    ]
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    } as any

    const v = stubVectorsForPage('page-A')
    const hits = await searchVisionIndex(fakeSupabase, {
      organization_id: 'org-A',
      query_vector: v.summary_vector,
    })
    expect(hits).toHaveLength(3)
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].summary_score).toBeLessThanOrEqual(hits[i - 1].summary_score)
    }
  })
})

// ─── getPatchVectors ──────────────────────────────────────────────────

describe('getPatchVectors', () => {
  it('returns null on not-found', async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any
    const r = await getPatchVectors(fakeSupabase, 'page-x', 'org-A')
    expect(r).toBeNull()
  })

  it('returns the patches matrix on hit', async () => {
    const stub = stubVectorsForPage('page-A')
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  patch_vectors: stub.patch_vectors,
                  embedding_dim: 128,
                  patch_count: 64,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any
    const r = await getPatchVectors(fakeSupabase, 'page-A', 'org-A')
    expect(r).not.toBeNull()
    expect(r!.patches).toEqual(stub.patch_vectors.patches)
    expect(r!.embedding_dim).toBe(128)
    expect(r!.patch_count).toBe(64)
  })
})

// ─── SearchQuerySchema ───────────────────────────────────────────────

describe('SearchQuerySchema', () => {
  it('accepts a valid query', () => {
    const v = stubVectorsForPage('p')
    expect(SearchQuerySchema.parse({
      query_vector: v.summary_vector,
      k: 5,
    }).k).toBe(5)
  })

  it('rejects wrong dim', () => {
    expect(() =>
      SearchQuerySchema.parse({ query_vector: [1, 2, 3] }),
    ).toThrow()
  })

  it('rejects k=0 / k>100', () => {
    const v = stubVectorsForPage('p')
    expect(() =>
      SearchQuerySchema.parse({ query_vector: v.summary_vector, k: 0 }),
    ).toThrow()
    expect(() =>
      SearchQuerySchema.parse({ query_vector: v.summary_vector, k: 101 }),
    ).toThrow()
  })

  it('rejects non-finite floats', () => {
    const bad = new Array(128).fill(0)
    bad[0] = NaN
    expect(() => SearchQuerySchema.parse({ query_vector: bad })).toThrow()
  })
})
