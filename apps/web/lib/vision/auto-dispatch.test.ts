/**
 * Phase 12 Task B — auto-dispatch tests.
 *
 * Covers:
 *   - flag off → no-op return
 *   - flag on + 0 pages → no-op
 *   - flag on + existing vision_pages → no-op (idempotent)
 *   - flag on + fresh doc → vision_pages + vision_index_jobs inserted
 *   - 23505 race during page insert → silent no-op (already_dispatched)
 *   - non-23505 page-insert error → throws
 *   - job-insert error → throws
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  autoDispatchEnabled,
  enqueueDocumentForVision,
  VISION_AUTO_DISPATCH_ENV,
} from './auto-dispatch'

// ─── Flag tests ───────────────────────────────────────────────────────

describe('autoDispatchEnabled', () => {
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env[VISION_AUTO_DISPATCH_ENV]
    delete process.env[VISION_AUTO_DISPATCH_ENV]
  })
  afterEach(() => {
    if (prev !== undefined) process.env[VISION_AUTO_DISPATCH_ENV] = prev
    else delete process.env[VISION_AUTO_DISPATCH_ENV]
  })

  it('returns false when unset (default OFF)', () => {
    expect(autoDispatchEnabled()).toBe(false)
  })
  it("returns true when env is exactly 'true' (case-insensitive)", () => {
    process.env[VISION_AUTO_DISPATCH_ENV] = 'true'
    expect(autoDispatchEnabled()).toBe(true)
    process.env[VISION_AUTO_DISPATCH_ENV] = 'TRUE'
    expect(autoDispatchEnabled()).toBe(true)
    process.env[VISION_AUTO_DISPATCH_ENV] = 'True'
    expect(autoDispatchEnabled()).toBe(true)
  })
  it('returns false on typos / non-true values', () => {
    process.env[VISION_AUTO_DISPATCH_ENV] = '1'
    expect(autoDispatchEnabled()).toBe(false)
    process.env[VISION_AUTO_DISPATCH_ENV] = 'yes'
    expect(autoDispatchEnabled()).toBe(false)
    process.env[VISION_AUTO_DISPATCH_ENV] = 'false'
    expect(autoDispatchEnabled()).toBe(false)
  })
  it('explicit override beats env', () => {
    process.env[VISION_AUTO_DISPATCH_ENV] = 'true'
    expect(autoDispatchEnabled('false')).toBe(false)
    process.env[VISION_AUTO_DISPATCH_ENV] = 'false'
    expect(autoDispatchEnabled('true')).toBe(true)
  })
})

// ─── Mock Supabase ────────────────────────────────────────────────────

interface CallLog {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

function makeMockSupabase(opts: {
  visionPagesSelect?: { data: unknown; error: unknown }
  visionPagesInsert?: { data: unknown; error: any }
  visionIndexJobsInsert?: { data: unknown; error: any }
} = {}) {
  const calls: CallLog[] = []
  function makeChain(table: string) {
    const log: CallLog = { table, ops: [] }
    calls.push(log)
    const chain: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          const methods = log.ops.map((o) => o.method)
          if (table === 'vision_pages') {
            if (methods.includes('insert')) {
              return (resolve: (v: unknown) => void) =>
                resolve(opts.visionPagesInsert ?? { data: null, error: null })
            }
            return (resolve: (v: unknown) => void) =>
              resolve(opts.visionPagesSelect ?? { data: [], error: null })
          }
          if (table === 'vision_index_jobs') {
            return (resolve: (v: unknown) => void) =>
              resolve(opts.visionIndexJobsInsert ?? { data: null, error: null })
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
  return {
    client: { from: (table: string) => makeChain(table) } as any,
    calls,
  }
}

// ─── enqueueDocumentForVision tests ────────────────────────────────────

describe('enqueueDocumentForVision — flag off', () => {
  it('returns flag_off without calling supabase', async () => {
    const { client, calls } = makeMockSupabase()
    const result = await enqueueDocumentForVision(
      client,
      { documentId: 'doc-1', organizationId: 'org-A', pageCount: 5 },
      'false',
    )
    expect(result).toEqual({ enqueued: false, reason: 'flag_off' })
    expect(calls.length).toBe(0)
  })
})

describe('enqueueDocumentForVision — zero pages', () => {
  it('returns no_pages when pageCount=0', async () => {
    const { client, calls } = makeMockSupabase()
    const result = await enqueueDocumentForVision(
      client,
      { documentId: 'doc-1', organizationId: 'org-A', pageCount: 0 },
      'true',
    )
    expect(result).toEqual({ enqueued: false, reason: 'no_pages' })
    expect(calls.length).toBe(0)
  })
})

describe('enqueueDocumentForVision — idempotency', () => {
  it('returns already_dispatched when vision_pages already exist', async () => {
    const { client } = makeMockSupabase({
      visionPagesSelect: { data: [{ id: 'p-existing' }], error: null },
    })
    const result = await enqueueDocumentForVision(
      client,
      { documentId: 'doc-1', organizationId: 'org-A', pageCount: 5 },
      'true',
    )
    expect(result.enqueued).toBe(false)
    expect(result.reason).toBe('already_dispatched')
  })

  it('returns already_dispatched on a 23505 race during page insert', async () => {
    const { client } = makeMockSupabase({
      visionPagesSelect: { data: [], error: null },
      visionPagesInsert: { data: null, error: { code: '23505', message: 'duplicate key' } },
    })
    const result = await enqueueDocumentForVision(
      client,
      { documentId: 'doc-1', organizationId: 'org-A', pageCount: 3 },
      'true',
    )
    expect(result.enqueued).toBe(false)
    expect(result.reason).toBe('already_dispatched')
  })
})

describe('enqueueDocumentForVision — happy path', () => {
  it('inserts pages + job + returns jobId', async () => {
    const { client, calls } = makeMockSupabase({
      visionPagesSelect: { data: [], error: null },
      visionPagesInsert: {
        data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
        error: null,
      },
      visionIndexJobsInsert: { data: { id: 'job-1' }, error: null },
    })
    const result = await enqueueDocumentForVision(
      client,
      { documentId: 'doc-1', organizationId: 'org-A', pageCount: 3 },
      'true',
    )
    expect(result.enqueued).toBe(true)
    expect(result.jobId).toBe('job-1')
    expect(result.reason).toBe('inserted')

    // Verify vision_pages.insert called with 3 rows. There are TWO
    // vision_pages CallLogs (one for SELECT idempotency check, one for
    // INSERT) — pick the one that actually contains an insert op.
    const pagesInsert = calls
      .filter((c) => c.table === 'vision_pages')
      .flatMap((c) => c.ops)
      .find((o) => o.method === 'insert')!
    const rows = pagesInsert.args[0] as any[]
    expect(rows.length).toBe(3)
    expect(rows.map((r) => r.page_number)).toEqual([0, 1, 2])
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
    expect(rows.every((r) => r.organization_id === 'org-A')).toBe(true)
    expect(rows.every((r) => r.source_document_id === 'doc-1')).toBe(true)
    // page_image_path follows the convention
    expect(rows[0].page_image_path).toBe('org-A/doc-1/page_0.png')

    // Verify vision_index_jobs.insert with the right page IDs
    const jobInsert = calls
      .filter((c) => c.table === 'vision_index_jobs')
      .flatMap((c) => c.ops)
      .find((o) => o.method === 'insert')!
    const jobRow = jobInsert.args[0] as any
    expect(jobRow.organization_id).toBe('org-A')
    expect(jobRow.vision_page_ids).toEqual(['p1', 'p2', 'p3'])
    expect(jobRow.status).toBe('queued')
  })
})

describe('enqueueDocumentForVision — error propagation', () => {
  it('throws on a non-23505 page-insert error', async () => {
    const { client } = makeMockSupabase({
      visionPagesSelect: { data: [], error: null },
      visionPagesInsert: { data: null, error: { code: '42P01', message: 'relation not found' } },
    })
    await expect(
      enqueueDocumentForVision(
        client,
        { documentId: 'doc-1', organizationId: 'org-A', pageCount: 1 },
        'true',
      ),
    ).rejects.toThrow(/relation not found/)
  })

  it('throws on a job-insert error', async () => {
    const { client } = makeMockSupabase({
      visionPagesSelect: { data: [], error: null },
      visionPagesInsert: { data: [{ id: 'p1' }], error: null },
      visionIndexJobsInsert: { data: null, error: { code: '23502', message: 'null org_id' } },
    })
    await expect(
      enqueueDocumentForVision(
        client,
        { documentId: 'doc-1', organizationId: 'org-A', pageCount: 1 },
        'true',
      ),
    ).rejects.toThrow(/null org_id/)
  })
})
