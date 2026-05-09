/**
 * Sprint 8.9 — Modal worker tests.
 *
 * The Modal worker is the only piece in the vision-RAG stack that
 * makes real outbound HTTPS. We mock fetch + the Supabase storage
 * client so tests are hermetic.
 *
 * Coverage:
 *   1. Happy path: 1 page, 2 pages — vectors flow back as EmbedResult
 *   2. Batching: pages > batch size split into multiple HTTP calls
 *   3. Per-page failure inside a successful HTTP response is honored
 *   4. Wrong embedding dim → page marked failed, no insert
 *   5. Wrong patch dim → page marked failed
 *   6. Whole-batch HTTP failure (5xx, network) → all pages in batch failed
 *   7. Missing env (MODAL_API_KEY / MODAL_ENDPOINT_URL) → all failed
 *   8. Signed-URL failure on one page → that page failed, others proceed
 *   9. Result order matches input order
 *  10. Modal omits a page from the response → that page failed
 */
import { describe, it, expect, vi } from 'vitest'
import { createModalWorker, MODAL_EMBEDDING_DIM, MODAL_DEFAULT_BATCH_SIZE } from './modal'
import type { VisionPage } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────

function fakePage(id: string, idx = 0): VisionPage {
  return {
    id,
    organization_id: 'org-A',
    source_document_id: 'doc-1',
    page_number: idx,
    page_image_path: `org-A/doc-1/page_${idx}.png`,
    status: 'embedding',
    vision_model: null,
    vision_index_id: null,
    confidence_score: null,
    error_message: null,
    rendered_at: null,
    embedded_at: null,
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    deleted_at: null,
  } as VisionPage
}

function makeFakeSupabase(opts: { signedUrl?: string; signError?: string } = {}) {
  return {
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: vi.fn().mockResolvedValue(
          opts.signError
            ? { data: null, error: { message: opts.signError } }
            : { data: { signedUrl: opts.signedUrl ?? 'https://example.com/signed.png' }, error: null },
        ),
      }),
    },
  } as any
}

function fakeVector(seed: number, dim = MODAL_EMBEDDING_DIM): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed * 0.01 + i * 0.001))
}

function fakePatches(n = 64, seed = 1): number[][] {
  return Array.from({ length: n }, (_, i) => fakeVector(seed + i))
}

function makeFetchOk(
  response: { results: Array<{ vision_page_id: string; summary_vector?: number[]; patch_vectors?: number[][]; model_used?: string; success: boolean; error?: string }> },
) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  } as any) as unknown as typeof fetch
}

const ENV_OK = { MODAL_API_KEY: 'sk-test', MODAL_ENDPOINT_URL: 'https://modal.example/embed' }

// ─── Tests ───────────────────────────────────────────────────────────

describe('createModalWorker — happy path', () => {
  it('returns one EmbedResult with vectors for one page', async () => {
    const fetchFn = makeFetchOk({
      results: [{
        vision_page_id: 'p-1',
        summary_vector: fakeVector(1),
        patch_vectors: fakePatches(64, 1),
        model_used: 'colqwen2-v1',
        success: true,
      }],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])

    expect(results.length).toBe(1)
    expect(results[0].vision_page_id).toBe('p-1')
    expect(results[0].success).toBe(true)
    expect(results[0].model_used).toBe('colqwen2-v1')
    expect(results[0].embedding_dim).toBe(MODAL_EMBEDDING_DIM)
    expect(results[0].summary_vector?.length).toBe(MODAL_EMBEDDING_DIM)
    expect(results[0].patch_vectors?.patches.length).toBe(64)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('processes multiple pages in a single batch when below batch size', async () => {
    const pages = [fakePage('p-1', 0), fakePage('p-2', 1), fakePage('p-3', 2)]
    const fetchFn = makeFetchOk({
      results: pages.map((p, i) => ({
        vision_page_id: p.id,
        summary_vector: fakeVector(i),
        patch_vectors: fakePatches(64, i + 1),
        success: true,
      })),
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed(pages)

    expect(results.length).toBe(3)
    expect(results.map((r) => r.success)).toEqual([true, true, true])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('preserves input order in the output', async () => {
    const pages = [fakePage('p-3', 2), fakePage('p-1', 0), fakePage('p-2', 1)]
    // Modal returns out of order — the worker must restore input order.
    const fetchFn = makeFetchOk({
      results: [
        { vision_page_id: 'p-1', summary_vector: fakeVector(1), patch_vectors: fakePatches(), success: true },
        { vision_page_id: 'p-2', summary_vector: fakeVector(2), patch_vectors: fakePatches(), success: true },
        { vision_page_id: 'p-3', summary_vector: fakeVector(3), patch_vectors: fakePatches(), success: true },
      ],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed(pages)
    expect(results.map((r) => r.vision_page_id)).toEqual(['p-3', 'p-1', 'p-2'])
  })
})

describe('createModalWorker — batching', () => {
  it('splits pages > MODAL_DEFAULT_BATCH_SIZE into multiple HTTP calls', async () => {
    const total = MODAL_DEFAULT_BATCH_SIZE + 3
    const pages = Array.from({ length: total }, (_, i) => fakePage(`p-${i}`, i))
    let callCount = 0
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init: any) => {
      callCount++
      const body = JSON.parse(init.body as string)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: body.pages.map((rp: any) => ({
            vision_page_id: rp.vision_page_id,
            summary_vector: fakeVector(1),
            patch_vectors: fakePatches(),
            success: true,
          })),
        }),
        text: async () => '',
      }
    }) as unknown as typeof fetch

    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed(pages)
    expect(results.length).toBe(total)
    expect(results.every((r) => r.success)).toBe(true)
    // 11 pages with batch size 8 → 2 calls
    expect(callCount).toBe(2)
  })

  it('honors MODAL_BATCH_SIZE env override', async () => {
    const pages = Array.from({ length: 6 }, (_, i) => fakePage(`p-${i}`, i))
    let callCount = 0
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init: any) => {
      callCount++
      const body = JSON.parse(init.body as string)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: body.pages.map((rp: any) => ({
            vision_page_id: rp.vision_page_id,
            summary_vector: fakeVector(1),
            patch_vectors: fakePatches(),
            success: true,
          })),
        }),
        text: async () => '',
      }
    }) as unknown as typeof fetch

    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: { ...ENV_OK, MODAL_BATCH_SIZE: '2' },
      fetchFn,
    })
    await worker.embed(pages)
    expect(callCount).toBe(3) // 6 pages, batch=2 → 3 calls
  })
})

describe('createModalWorker — per-page failures', () => {
  it('honors success=false from Modal as a per-page failure', async () => {
    const fetchFn = makeFetchOk({
      results: [
        { vision_page_id: 'p-1', summary_vector: fakeVector(1), patch_vectors: fakePatches(), success: true },
        { vision_page_id: 'p-2', success: false, error: 'OOM on this page' },
      ],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0), fakePage('p-2', 1)])
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(false)
    expect(results[1].error).toMatch(/OOM/)
  })

  it('rejects wrong summary_vector dim as a per-page failure', async () => {
    const fetchFn = makeFetchOk({
      results: [{
        vision_page_id: 'p-1',
        summary_vector: [1, 2, 3], // way too short
        patch_vectors: fakePatches(),
        success: true,
      }],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/summary_vector/)
  })

  it('rejects wrong patch dim as a per-page failure', async () => {
    const fetchFn = makeFetchOk({
      results: [{
        vision_page_id: 'p-1',
        summary_vector: fakeVector(1),
        patch_vectors: [[1, 2, 3]], // patches[0] wrong length
        success: true,
      }],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/patch 0/)
  })

  it('marks page failed when Modal omits it from the response', async () => {
    const fetchFn = makeFetchOk({
      results: [
        // p-1 missing entirely
        { vision_page_id: 'p-2', summary_vector: fakeVector(2), patch_vectors: fakePatches(), success: true },
      ],
    })
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0), fakePage('p-2', 1)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/omitted/)
    expect(results[1].success).toBe(true)
  })
})

describe('createModalWorker — batch-level failures', () => {
  it('marks all pages in batch failed on HTTP 5xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal error',
      json: async () => ({}),
    }) as unknown as typeof fetch
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0), fakePage('p-2', 1)])
    expect(results.every((r) => !r.success)).toBe(true)
    expect(results.every((r) => r.error?.includes('500'))).toBe(true)
  })

  it('marks all pages in batch failed on network throw', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/ECONNREFUSED/)
  })

  it('marks all pages in batch failed when response body has no results[]', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ wrong_shape: true }),
      text: async () => '',
    }) as unknown as typeof fetch
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/malformed/)
  })
})

describe('createModalWorker — config + signed URL failures', () => {
  it('marks all pages failed when MODAL_API_KEY is missing', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: { MODAL_ENDPOINT_URL: 'https://modal.example/embed' },
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/MODAL_API_KEY/)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('marks all pages failed when MODAL_ENDPOINT_URL is missing', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const worker = createModalWorker({
      supabase: makeFakeSupabase(),
      env: { MODAL_API_KEY: 'sk-test' },
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/MODAL_ENDPOINT_URL/)
  })

  it('marks only the page with a signed-URL failure as failed; others proceed', async () => {
    // First call to createSignedUrl fails, subsequent succeed.
    let callIdx = 0
    const supabase = {
      storage: {
        from: (_bucket: string) => ({
          createSignedUrl: vi.fn().mockImplementation(async () => {
            callIdx++
            if (callIdx === 1) return { data: null, error: { message: 'object not found' } }
            return { data: { signedUrl: 'https://example.com/signed.png' }, error: null }
          }),
        }),
      },
    } as any
    const fetchFn = vi.fn().mockImplementation(async (_url: string, init: any) => {
      const body = JSON.parse(init.body as string)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: body.pages.map((rp: any) => ({
            vision_page_id: rp.vision_page_id,
            summary_vector: fakeVector(1),
            patch_vectors: fakePatches(),
            success: true,
          })),
        }),
        text: async () => '',
      }
    }) as unknown as typeof fetch

    const worker = createModalWorker({
      supabase,
      env: ENV_OK,
      fetchFn,
    })
    const results = await worker.embed([fakePage('p-1', 0), fakePage('p-2', 1)])
    expect(results[0].success).toBe(false)
    expect(results[0].error).toMatch(/signed url/)
    expect(results[1].success).toBe(true)
  })
})
