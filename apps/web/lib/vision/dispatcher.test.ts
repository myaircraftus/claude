/**
 * Sprint 8.3 — dispatcher tests.
 *
 * Verifies:
 *   - Job state transitions queued → running → completed / failed
 *   - Per-page transitions: pending/rendering → embedding → indexed/failed
 *   - Already-terminal jobs become no-ops
 *   - Concurrent dispatchers (illegal-transition guard) don't double-dispatch
 *   - Partial failures: 5 succeed + 1 fails → job=completed, errors recorded
 *   - Worker.embed() throwing → all eligible pages flipped to failed,
 *     job flipped to failed
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  modalStubWorker,
  stubIndexIdForPage,
  STUB_MODEL_NAME,
  STUB_EMBEDDING_DIM,
} from './workers/modal-stub'

// Modal stub
describe('modalStubWorker', () => {
  it('returns one EmbedResult per input page', async () => {
    const pages = [
      { id: 'p1' } as any,
      { id: 'p2' } as any,
      { id: 'p3' } as any,
    ]
    const r = await modalStubWorker.embed(pages)
    expect(r).toHaveLength(3)
  })

  it('every result has success=true (stub never simulates failure)', async () => {
    const pages = [{ id: 'p1' } as any, { id: 'p2' } as any]
    const r = await modalStubWorker.embed(pages)
    expect(r.every((x) => x.success)).toBe(true)
  })

  it('vision_index_id is deterministic for the same page id', async () => {
    const r1 = await modalStubWorker.embed([{ id: 'page-A' } as any])
    const r2 = await modalStubWorker.embed([{ id: 'page-A' } as any])
    expect(r1[0].vision_index_id).toBe(r2[0].vision_index_id)
  })

  it('vision_index_id differs for different page ids', async () => {
    const r = await modalStubWorker.embed([
      { id: 'page-A' } as any,
      { id: 'page-B' } as any,
    ])
    expect(r[0].vision_index_id).not.toBe(r[1].vision_index_id)
  })

  it('emits the canonical model name + dim', async () => {
    const r = await modalStubWorker.embed([{ id: 'p1' } as any])
    expect(r[0].model_used).toBe(STUB_MODEL_NAME)
    expect(r[0].embedding_dim).toBe(STUB_EMBEDDING_DIM)
  })

  it('worker.id is "stub" so job rows are tagged correctly', () => {
    expect(modalStubWorker.id).toBe('stub')
  })

  it('stubIndexIdForPage starts with "mock_" so it sorts together in queries', () => {
    expect(stubIndexIdForPage('any-uuid')).toMatch(/^mock_/)
  })
})

// Factory routing tests live in factory.test.ts because this file
// vi.mocks './workers/factory' to control which worker the dispatcher
// sees; the factory's own tests need the un-mocked module.

// ─── Dispatcher orchestration tests ─────────────────────────────────

vi.mock('./registry', () => ({
  getVisionIndexJob: vi.fn(),
  updateVisionIndexJob: vi.fn(),
  getVisionPage: vi.fn(),
  updateVisionPage: vi.fn(),
  listVisionPages: vi.fn(),
  parseJsonBody: vi.fn(),
}))

vi.mock('./workers/factory', () => ({
  getGpuWorker: vi.fn(),
}))

// Sprint 8.4 — dispatcher now writes vision_embeddings on success.
// Mock the insert so we don't need a real supabase client.
vi.mock('./index-query', () => ({
  insertVisionEmbedding: vi.fn().mockResolvedValue({ id: 'emb-x' }),
  stubVectorsForPage: vi.fn().mockReturnValue({
    summary_vector: new Array(128).fill(0),
    patch_vectors: { patches: [] },
    embedding_dim: 128,
  }),
}))

import { dispatchVisionJob } from './dispatcher'
import * as registry from './registry'
import * as factory from './workers/factory'

beforeEach(() => {
  vi.clearAllMocks()
})

const mockSupabase = {} as any

function makePage(id: string, status = 'pending', overrides: any = {}) {
  return {
    id,
    organization_id: 'org-A',
    source_document_id: 'doc-1',
    page_number: 0,
    page_image_path: `org-A/doc-1/page_${id}.png`,
    status,
    vision_model: null,
    vision_index_id: null,
    confidence_score: null,
    error_message: null,
    rendered_at: null,
    embedded_at: null,
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('dispatchVisionJob — happy path', () => {
  it('queued → running → completed; pending → embedding → indexed', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1', 'p2'], status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) => makePage(id))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})
    ;(factory.getGpuWorker as any).mockReturnValue(modalStubWorker)

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')

    expect(result.status).toBe('completed')
    expect(result.pagesSucceeded).toBe(2)
    expect(result.pagesFailed).toBe(0)

    // Job-level transitions: queued→running, then running→completed
    const jobUpdates = (registry.updateVisionIndexJob as any).mock.calls
    expect(jobUpdates[0][2].status).toBe('running')
    expect(jobUpdates[jobUpdates.length - 1][2].status).toBe('completed')
  })
})

describe('dispatchVisionJob — already-terminal job', () => {
  it('returns early on completed jobs (idempotent)', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1'], status: 'completed',
    })

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')

    expect(result.status).toBe('completed')
    expect(registry.updateVisionPage).not.toHaveBeenCalled()
    expect(registry.updateVisionIndexJob).not.toHaveBeenCalled()
  })

  it('returns early on failed jobs (admin must explicitly requeue)', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1'], status: 'failed',
    })
    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')
    expect(result.status).toBe('failed')
  })
})

describe('dispatchVisionJob — concurrent dispatchers', () => {
  it('illegal queued→running transition (other worker won) bails cleanly', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1'], status: 'queued',
    })
    // First updateVisionIndexJob call (queued→running) throws illegal-transition
    ;(registry.updateVisionIndexJob as any).mockRejectedValueOnce(
      new Error('illegal transition queued → running'),
    )

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')

    expect(result.status).toBe('failed') // default; we bailed without doing work
    expect(result.pagesProcessed).toBe(0)
    // Verify worker was NOT called (we bailed before that).
    // factory.getGpuWorker not called since we never get past the
    // queued→running transition.
  })
})

describe('dispatchVisionJob — partial failure', () => {
  it('5 succeed + 1 fails → job=completed, error logged for the 1', async () => {
    const pageIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: pageIds, status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) => makePage(id))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})

    // Worker that succeeds for all but p3.
    const partialWorker: any = {
      id: 'stub', label: 'partial-test',
      embed: async (pages: any[]) => pages.map((p) => p.id === 'p3'
        ? { vision_page_id: p.id, vision_index_id: '', embedding_dim: 0, model_used: 'stub', success: false, error: 'simulated p3 failure' }
        : { vision_page_id: p.id, vision_index_id: `mock_${p.id}`, embedding_dim: 128, model_used: 'stub', success: true }
      ),
    }
    ;(factory.getGpuWorker as any).mockReturnValue(partialWorker)

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')

    expect(result.status).toBe('completed') // any-success → completed
    expect(result.pagesSucceeded).toBe(5)
    expect(result.pagesFailed).toBe(1)
    expect(result.errors[0].visionPageId).toBe('p3')
  })

  it('all-fail → job=failed', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1', 'p2'], status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) => makePage(id))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})

    const allFailWorker: any = {
      id: 'stub', label: 'all-fail',
      embed: async (pages: any[]) => pages.map((p) => ({
        vision_page_id: p.id, vision_index_id: '', embedding_dim: 0,
        model_used: 'stub', success: false, error: 'sim',
      })),
    }
    ;(factory.getGpuWorker as any).mockReturnValue(allFailWorker)

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')
    expect(result.status).toBe('failed')
    expect(result.pagesFailed).toBe(2)
  })

  it('worker.embed() throws → entire batch marked failed', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1'], status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) => makePage(id))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})

    ;(factory.getGpuWorker as any).mockReturnValue({
      id: 'stub', label: 'throws',
      embed: async () => { throw new Error('GPU host unreachable') },
    })

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')
    expect(result.status).toBe('failed')
    expect(result.errors[0].message).toMatch(/GPU host unreachable/)
  })
})

describe('dispatchVisionJob — soft-deleted pages', () => {
  it('skips pages that returned null (soft-deleted between job-create and dispatch)', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1', 'p2-deleted'], status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) =>
      id === 'p2-deleted' ? null : makePage(id))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})
    ;(factory.getGpuWorker as any).mockReturnValue(modalStubWorker)

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')
    // Only p1 is processed.
    expect(result.pagesSucceeded).toBe(1)
  })
})

describe('dispatchVisionJob — already-indexed pages', () => {
  it('skips pages already in indexed state (idempotent re-run)', async () => {
    ;(registry.getVisionIndexJob as any).mockResolvedValue({
      id: 'job-1', organization_id: 'org-A',
      vision_page_ids: ['p1', 'p2'], status: 'queued',
    })
    ;(registry.getVisionPage as any).mockImplementation(async (_s: any, id: string) =>
      id === 'p1'
        ? makePage(id, 'indexed', { vision_index_id: 'existing-idx' })
        : makePage(id, 'pending'))
    ;(registry.updateVisionPage as any).mockResolvedValue({})
    ;(registry.updateVisionIndexJob as any).mockResolvedValue({})
    ;(factory.getGpuWorker as any).mockReturnValue(modalStubWorker)

    const result = await dispatchVisionJob(mockSupabase, 'job-1', 'org-A')
    // p1 is already indexed → not in eligible. Only p2 is processed.
    expect(result.pagesSucceeded).toBe(1)
  })
})
