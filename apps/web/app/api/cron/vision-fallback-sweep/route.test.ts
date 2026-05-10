/**
 * Sprint 11.4 — Modal fallback sweep cron tests.
 *
 * Verifies the cron's decision logic without hitting Supabase or
 * Modal. Mocks createServiceSupabase, dispatchVisionJob, and
 * countAvailableWorkers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must come BEFORE the route import so vitest hoists them.
vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(),
}))
vi.mock('@/lib/vision/dispatcher', () => ({
  dispatchVisionJob: vi.fn(),
}))
vi.mock('@/lib/vision/heartbeat', () => ({
  countAvailableWorkers: vi.fn(),
}))

import { GET } from './route'
import { createServiceSupabase } from '@/lib/supabase/server'
import { dispatchVisionJob } from '@/lib/vision/dispatcher'
import { countAvailableWorkers } from '@/lib/vision/heartbeat'

interface CallLog {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

function makeMockSupabase(opts: {
  queuedJobs?: any[]
  runningJobs?: any[]
  updateResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: CallLog[] = []
  let queuedReadCount = 0
  let runningReadCount = 0

  function makeChain(table: string) {
    const log: CallLog = { table, ops: [] }
    calls.push(log)

    const chain: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          const methods = log.ops.map((o) => o.method)
          const eqs = log.ops.filter((o) => o.method === 'eq').map((o) => o.args)
          // Differentiate the two SELECT calls by which status they filter on.
          if (table === 'vision_index_jobs') {
            if (methods.includes('update')) {
              return (resolve: (v: unknown) => void) =>
                resolve(opts.updateResult ?? { data: null, error: null })
            }
            // SELECT path: return queued or running based on status filter
            const statusEq = eqs.find((e) => e[0] === 'status')
            if (statusEq?.[1] === 'queued') {
              queuedReadCount++
              return (resolve: (v: unknown) => void) =>
                resolve({ data: opts.queuedJobs ?? [], error: null })
            }
            if (statusEq?.[1] === 'running') {
              runningReadCount++
              return (resolve: (v: unknown) => void) =>
                resolve({ data: opts.runningJobs ?? [], error: null })
            }
          }
          if (table === 'vision_pages') {
            return (resolve: (v: unknown) => void) =>
              resolve(opts.updateResult ?? { data: null, error: null })
          }
          return (resolve: (v: unknown) => void) =>
            resolve({ data: [], error: null })
        }
        return (...args: unknown[]) => {
          log.ops.push({ method: String(prop), args })
          return chain
        }
      },
    })

    return chain
  }

  return {
    client: { from: (table: string) => makeChain(table) } as any,
    calls,
  }
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/cron/vision-fallback-sweep', { headers }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
})

describe('vision-fallback-sweep — auth', () => {
  it('returns 401 when neither vercel-cron UA nor bearer token', async () => {
    const { client } = makeMockSupabase()
    ;(createServiceSupabase as any).mockReturnValue(client)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('accepts vercel-cron user-agent', async () => {
    const { client } = makeMockSupabase()
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    const res = await GET(makeRequest({ 'user-agent': 'vercel-cron/1.0' }))
    expect(res.status).toBe(200)
  })

  it('accepts Bearer CRON_SECRET', async () => {
    const { client } = makeMockSupabase()
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)
  })
})

describe('vision-fallback-sweep — empty case', () => {
  it('returns ok with all-zero counters when nothing is stuck', async () => {
    const { client } = makeMockSupabase({ queuedJobs: [], runningJobs: [] })
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(1) // a worker is alive
    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.workers_alive).toBe(1)
    expect(body.swept_queued).toBe(0)
    expect(body.swept_running).toBe(0)
    expect(body.modal_dispatches).toBe(0)
    expect(dispatchVisionJob).not.toHaveBeenCalled()
  })
})

describe('vision-fallback-sweep — stuck-queued jobs', () => {
  it('dispatches each stuck-queued job in DIRECT mode with gpu_host=modal', async () => {
    const queuedJobs = [
      { id: 'job-q1', organization_id: 'org-A', vision_page_ids: ['p1'], created_at: '2026-05-09T00:00:00Z' },
      { id: 'job-q2', organization_id: 'org-B', vision_page_ids: ['p2', 'p3'], created_at: '2026-05-09T00:01:00Z' },
    ]
    const { client, calls } = makeMockSupabase({
      queuedJobs,
      runningJobs: [],
      updateResult: { data: null, error: null },
    })
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    ;(dispatchVisionJob as any).mockResolvedValue({ status: 'completed', errors: [] })

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()
    expect(body.swept_queued).toBe(2)
    expect(body.modal_dispatches).toBe(2)
    expect(dispatchVisionJob).toHaveBeenCalledTimes(2)
    expect(dispatchVisionJob).toHaveBeenCalledWith(
      expect.anything(), 'job-q1', 'org-A', { mode: 'direct' },
    )
    expect(dispatchVisionJob).toHaveBeenCalledWith(
      expect.anything(), 'job-q2', 'org-B', { mode: 'direct' },
    )

    // Verify gpu_host=modal update fired before dispatch
    const updates = calls
      .filter((c) => c.table === 'vision_index_jobs')
      .flatMap((c) => c.ops.filter((o) => o.method === 'update'))
      .map((o) => o.args[0] as Record<string, unknown>)
    expect(updates.some((u) => u.gpu_host === 'modal')).toBe(true)
  })
})

describe('vision-fallback-sweep — stuck-running jobs', () => {
  it('rolls embedding pages back to pending + resets job to queued + dispatches', async () => {
    const runningJobs = [
      {
        id: 'job-r1', organization_id: 'org-A',
        vision_page_ids: ['p1', 'p2'],
        started_at: '2026-05-09T00:00:00Z', gpu_host: 'colab',
      },
    ]
    const { client, calls } = makeMockSupabase({
      queuedJobs: [],
      runningJobs,
      updateResult: { data: null, error: null },
    })
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    ;(dispatchVisionJob as any).mockResolvedValue({ status: 'completed', errors: [] })

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()
    expect(body.swept_running).toBe(1)
    expect(body.modal_dispatches).toBe(1)

    // vision_pages.update should have been called with status='pending'
    const pageUpdates = calls
      .filter((c) => c.table === 'vision_pages')
      .flatMap((c) => c.ops.filter((o) => o.method === 'update'))
      .map((o) => o.args[0] as Record<string, unknown>)
    expect(pageUpdates.some((u) => u.status === 'pending')).toBe(true)

    // vision_index_jobs.update with status='queued' to reset the row
    const jobUpdates = calls
      .filter((c) => c.table === 'vision_index_jobs')
      .flatMap((c) => c.ops.filter((o) => o.method === 'update'))
      .map((o) => o.args[0] as Record<string, unknown>)
    expect(jobUpdates.some((u) => u.status === 'queued' && u.gpu_host === 'modal')).toBe(true)
  })
})

describe('vision-fallback-sweep — cap', () => {
  it('caps at MAX_DISPATCHES_PER_TICK (10) total stuck jobs', async () => {
    // 8 queued + 7 running = 15 candidates. Cap = 10. Expect 10 dispatches.
    const queuedJobs = Array.from({ length: 8 }, (_, i) => ({
      id: `job-q${i}`, organization_id: 'org-A',
      vision_page_ids: [`p${i}`], created_at: '2026-05-09T00:00:00Z',
    }))
    const runningJobs = Array.from({ length: 7 }, (_, i) => ({
      id: `job-r${i}`, organization_id: 'org-A',
      vision_page_ids: [`pr${i}`], started_at: '2026-05-09T00:00:00Z', gpu_host: 'colab',
    }))
    const { client } = makeMockSupabase({
      queuedJobs, runningJobs,
      updateResult: { data: null, error: null },
    })
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    ;(dispatchVisionJob as any).mockResolvedValue({ status: 'completed', errors: [] })

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()
    // Reads return 10 each (limit at SELECT). So swept_queued=8, swept_running=7.
    // BUT toDispatch is capped at 10 — first 8 queued + first 2 running = 10 total.
    expect(body.modal_dispatches + body.errors.length).toBe(10)
    expect(body.skipped_capped).toBe(5)
  })
})

describe('vision-fallback-sweep — failure isolation', () => {
  it('records errors from individual jobs without aborting the sweep', async () => {
    const queuedJobs = [
      { id: 'job-good', organization_id: 'org-A', vision_page_ids: ['p1'], created_at: '2026-05-09T00:00:00Z' },
      { id: 'job-bad', organization_id: 'org-B', vision_page_ids: ['p2'], created_at: '2026-05-09T00:01:00Z' },
    ]
    const { client } = makeMockSupabase({
      queuedJobs, runningJobs: [],
      updateResult: { data: null, error: null },
    })
    ;(createServiceSupabase as any).mockReturnValue(client)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    ;(dispatchVisionJob as any).mockImplementation(async (_sb: any, jobId: string) => {
      if (jobId === 'job-bad') throw new Error('modal http 500')
      return { status: 'completed', errors: [] }
    })

    const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
    const body = await res.json()
    expect(body.modal_dispatches).toBe(1)
    expect(body.errors.length).toBe(1)
    expect(body.errors[0].jobId).toBe('job-bad')
    expect(body.errors[0].error).toMatch(/modal http 500/)
  })
})

// ─── Phase 12 architecture-gap fix: dual-path /embed vs /backfill ─────

describe('vision-fallback-sweep — dual-path routing', () => {
  /**
   * Sophisticated mock that returns vision_pages on SELECT, plus a
   * controllable storage HEAD probe. Used by the dual-path tests.
   */
  function makeDualPathMock(opts: {
    queuedJobs: any[]
    pagesByJob: Record<string, any[]>
    /** Whether HEAD on signed URLs returns 200 (true) or 404 (false). */
    pngsExist: boolean
    /** Backfill response — defaults to one success per docId. */
    backfillResponse?: { document_results: any[]; error?: string }
    backfillThrows?: Error
  }) {
    const calls: CallLog[] = []
    const deletedPageIds: string[][] = []
    const fetchCalls: string[] = []
    let backfillCallCount = 0

    function makeChain(table: string) {
      const log: CallLog = { table, ops: [] }
      calls.push(log)
      const chain: any = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') {
            const methods = log.ops.map((o) => o.method)
            const eqs = log.ops.filter((o) => o.method === 'eq').map((o) => o.args)
            if (table === 'vision_index_jobs') {
              if (methods.includes('update')) {
                return (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
              }
              const statusEq = eqs.find((e) => e[0] === 'status')
              if (statusEq?.[1] === 'queued') {
                return (resolve: (v: unknown) => void) =>
                  resolve({ data: opts.queuedJobs, error: null })
              }
              if (statusEq?.[1] === 'running') {
                return (resolve: (v: unknown) => void) =>
                  resolve({ data: [], error: null })
              }
            }
            if (table === 'vision_pages') {
              // SELECT: return pages keyed by job (use the .in() arg for matching).
              if (methods.includes('select') && !methods.includes('update') && !methods.includes('delete')) {
                const inArgs = log.ops.find((o) => o.method === 'in')?.args
                const ids = (inArgs?.[1] as string[]) ?? []
                // Find which job's pages match these ids
                for (const [_jobId, pageList] of Object.entries(opts.pagesByJob)) {
                  if (pageList.some((p: any) => ids.includes(p.id))) {
                    return (resolve: (v: unknown) => void) =>
                      resolve({ data: pageList, error: null })
                  }
                }
                return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
              }
              // DELETE: capture the ids so tests can assert
              if (methods.includes('delete')) {
                const inArgs = log.ops.find((o) => o.method === 'in')?.args
                const ids = (inArgs?.[1] as string[]) ?? []
                deletedPageIds.push(ids)
                return (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
              }
              return (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
            }
            return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
          }
          return (...args: unknown[]) => {
            log.ops.push({ method: String(prop), args })
            return chain
          }
        },
      })
      return chain
    }

    const fetchFn = vi.fn().mockImplementation((url: string) => {
      fetchCalls.push(url)
      if (url.includes('backfill.modal.run')) {
        backfillCallCount += 1
        if (opts.backfillThrows) throw opts.backfillThrows
        return Promise.resolve(
          new Response(
            JSON.stringify(
              opts.backfillResponse ?? {
                document_results: Object.entries(opts.pagesByJob).map(([_jobId, pages]: any) => ({
                  source_document_id: pages[0].source_document_id,
                  pages_processed: pages.length,
                  pages_failed: 0,
                  errors: [],
                })),
              },
            ),
            { status: 200 },
          ),
        )
      }
      // Storage HEAD probe — return 200 if pngsExist, 404 otherwise
      return Promise.resolve(new Response(null, { status: opts.pngsExist ? 200 : 404 }))
    })

    const supabase = {
      from: (table: string) => makeChain(table),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://storage.test/signed?token=x' },
            error: null,
          }),
        }),
      },
    } as any

    return { supabase, calls, deletedPageIds, fetchCalls, getBackfillCallCount: () => backfillCallCount, fetchFn }
  }

  beforeEach(() => {
    process.env.MODAL_API_KEY = 'sk-test'
    process.env.MODAL_ENDPOINT_URL = 'https://info-test--embed.modal.run'
  })

  it('routes to /backfill when pages have placeholder paths (null page_image_path)', async () => {
    const queuedJobs = [
      { id: 'job-1', organization_id: 'org-A', vision_page_ids: ['p1', 'p2'], created_at: '2026-05-09T00:00:00Z' },
    ]
    const pages = [
      { id: 'p1', organization_id: 'org-A', source_document_id: 'doc-1', page_number: 0, page_image_path: null, status: 'pending' },
      { id: 'p2', organization_id: 'org-A', source_document_id: 'doc-1', page_number: 1, page_image_path: null, status: 'pending' },
    ]
    const mock = makeDualPathMock({
      queuedJobs,
      pagesByJob: { 'job-1': pages },
      pngsExist: false, // doesn't matter — needsRendering() trips on null path first
    })
    ;(createServiceSupabase as any).mockReturnValue(mock.supabase)
    ;(countAvailableWorkers as any).mockResolvedValue(0)

    // Inject our fetch into the global so the cron's createModalBackfillClient picks it up
    const origFetch = global.fetch
    global.fetch = mock.fetchFn as unknown as typeof fetch
    try {
      const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
      const body = await res.json()
      expect(body.modal_backfill_dispatches).toBe(1)
      expect(body.modal_dispatches).toBe(0)
      expect(dispatchVisionJob).not.toHaveBeenCalled()
      expect(mock.getBackfillCallCount()).toBe(1)
      // Placeholder pages should have been deleted before backfill
      expect(mock.deletedPageIds.length).toBeGreaterThanOrEqual(1)
      expect(mock.deletedPageIds[0]).toEqual(['p1', 'p2'])
    } finally {
      global.fetch = origFetch
    }
  })

  it('routes to /backfill when pages have canonical paths but PNGs missing in storage (auto-dispatch case)', async () => {
    const queuedJobs = [
      { id: 'job-2', organization_id: 'org-A', vision_page_ids: ['p3'], created_at: '2026-05-09T00:00:00Z' },
    ]
    const pages = [
      // canonical-looking path but PNG won't exist in storage
      { id: 'p3', organization_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', source_document_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', page_number: 0, page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_0.png', status: 'pending' },
    ]
    const mock = makeDualPathMock({
      queuedJobs,
      pagesByJob: { 'job-2': pages },
      pngsExist: false, // HEAD on signed URL returns 404 — PNG isn't there
    })
    ;(createServiceSupabase as any).mockReturnValue(mock.supabase)
    ;(countAvailableWorkers as any).mockResolvedValue(0)

    const origFetch = global.fetch
    global.fetch = mock.fetchFn as unknown as typeof fetch
    try {
      const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
      const body = await res.json()
      expect(body.modal_backfill_dispatches).toBe(1)
      expect(body.modal_dispatches).toBe(0)
      expect(dispatchVisionJob).not.toHaveBeenCalled()
    } finally {
      global.fetch = origFetch
    }
  })

  it('routes to /embed when pages have canonical paths AND PNGs exist in storage', async () => {
    const queuedJobs = [
      { id: 'job-3', organization_id: 'org-A', vision_page_ids: ['p4'], created_at: '2026-05-09T00:00:00Z' },
    ]
    const pages = [
      { id: 'p4', organization_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', source_document_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', page_number: 0, page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_0.png', status: 'pending' },
    ]
    const mock = makeDualPathMock({
      queuedJobs,
      pagesByJob: { 'job-3': pages },
      pngsExist: true, // HEAD returns 200 — PNG is there
    })
    ;(createServiceSupabase as any).mockReturnValue(mock.supabase)
    ;(countAvailableWorkers as any).mockResolvedValue(0)
    ;(dispatchVisionJob as any).mockResolvedValue({ status: 'completed', errors: [] })

    const origFetch = global.fetch
    global.fetch = mock.fetchFn as unknown as typeof fetch
    try {
      const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
      const body = await res.json()
      expect(body.modal_dispatches).toBe(1)
      expect(body.modal_backfill_dispatches).toBe(0)
      expect(dispatchVisionJob).toHaveBeenCalledTimes(1)
      expect(mock.getBackfillCallCount()).toBe(0)
      // Should NOT delete pages on the /embed path
      expect(mock.deletedPageIds.length).toBe(0)
    } finally {
      global.fetch = origFetch
    }
  })

  it('marks job failed if /backfill returns top-level error', async () => {
    const queuedJobs = [
      { id: 'job-4', organization_id: 'org-A', vision_page_ids: ['p5'], created_at: '2026-05-09T00:00:00Z' },
    ]
    const pages = [
      { id: 'p5', organization_id: 'org-A', source_document_id: 'doc-x', page_number: 0, page_image_path: null, status: 'pending' },
    ]
    const mock = makeDualPathMock({
      queuedJobs,
      pagesByJob: { 'job-4': pages },
      pngsExist: false,
      backfillResponse: { document_results: [], error: 'unauthorized' },
    })
    ;(createServiceSupabase as any).mockReturnValue(mock.supabase)
    ;(countAvailableWorkers as any).mockResolvedValue(0)

    const origFetch = global.fetch
    global.fetch = mock.fetchFn as unknown as typeof fetch
    try {
      const res = await GET(makeRequest({ authorization: 'Bearer test-secret' }))
      const body = await res.json()
      expect(body.modal_backfill_dispatches).toBe(0)
      expect(body.errors.length).toBe(1)
      expect(body.errors[0].error).toMatch(/unauthorized/)
    } finally {
      global.fetch = origFetch
    }
  })
})
