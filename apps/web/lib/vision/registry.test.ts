/**
 * Sprint 8.1 — vision registry service tests.
 *
 * Focus areas:
 *   1. Happy-path CRUD for vision_pages + vision_index_jobs
 *   2. Org-isolation: a query with orgId=A never returns rows with orgId=B
 *      (the service layer asks Supabase to filter by organization_id; we
 *      verify the eq() call is wired through correctly)
 *   3. Status transitions are validated at the service layer (Postgres
 *      enforces membership in the CHECK constraint, but illegal
 *      transitions like indexed→pending need the TS-level check)
 *
 * The Supabase client is fully mocked — no DB. Each query method
 * returns a chainable thenable that resolves to a stub { data, error }.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createVisionPage,
  updateVisionPage,
  getVisionPage,
  listVisionPages,
  softDeleteVisionPage,
  createVisionIndexJob,
  updateVisionIndexJob,
  VisionPageCreateSchema,
  VisionPagePatchSchema,
  VisionIndexJobCreateSchema,
} from './registry'
import {
  isLegalVisionPageTransition,
  isLegalVisionJobTransition,
} from './types'

// ─── Schema-only tests (no mocking needed) ────────────────────────────

describe('VisionPageCreateSchema', () => {
  const valid = {
    organization_id: '00000000-0000-0000-0000-000000000001',
    source_document_id: '00000000-0000-0000-0000-000000000002',
    page_number: 0,
    page_image_path: 'org-1/doc-2/page_0.png',
  }

  it('accepts a minimal valid payload', () => {
    expect(VisionPageCreateSchema.parse(valid)).toMatchObject(valid)
  })

  it('rejects negative page_number', () => {
    expect(() =>
      VisionPageCreateSchema.parse({ ...valid, page_number: -1 }),
    ).toThrow()
  })

  it('rejects page_number > 10000 (sanity cap)', () => {
    expect(() =>
      VisionPageCreateSchema.parse({ ...valid, page_number: 99_999 }),
    ).toThrow()
  })

  it('rejects non-uuid organization_id', () => {
    expect(() =>
      VisionPageCreateSchema.parse({ ...valid, organization_id: 'not-a-uuid' }),
    ).toThrow()
  })

  it('rejects unknown status enum value', () => {
    expect(() =>
      VisionPageCreateSchema.parse({ ...valid, status: 'magical' as any }),
    ).toThrow()
  })

  it('rejects oversized page_image_path', () => {
    expect(() =>
      VisionPageCreateSchema.parse({ ...valid, page_image_path: 'a'.repeat(501) }),
    ).toThrow()
  })
})

describe('VisionPagePatchSchema', () => {
  it('rejects confidence_score outside [0,1]', () => {
    expect(() => VisionPagePatchSchema.parse({ confidence_score: 1.5 })).toThrow()
    expect(() => VisionPagePatchSchema.parse({ confidence_score: -0.1 })).toThrow()
  })

  it('accepts confidence_score=0 and =1 as the boundary values', () => {
    expect(VisionPagePatchSchema.parse({ confidence_score: 0 }).confidence_score).toBe(0)
    expect(VisionPagePatchSchema.parse({ confidence_score: 1 }).confidence_score).toBe(1)
  })

  it('accepts null for nullable fields', () => {
    expect(VisionPagePatchSchema.parse({ vision_index_id: null }).vision_index_id).toBe(null)
    expect(VisionPagePatchSchema.parse({ error_message: null }).error_message).toBe(null)
  })
})

describe('VisionIndexJobCreateSchema', () => {
  const orgId = '00000000-0000-0000-0000-000000000001'
  const pageId = '00000000-0000-0000-0000-000000000002'

  it('accepts a minimal payload', () => {
    expect(VisionIndexJobCreateSchema.parse({
      organization_id: orgId,
      vision_page_ids: [pageId],
    })).toBeTruthy()
  })

  it('rejects empty vision_page_ids[]', () => {
    expect(() => VisionIndexJobCreateSchema.parse({
      organization_id: orgId,
      vision_page_ids: [],
    })).toThrow()
  })

  it('rejects more than 500 vision_page_ids in one batch', () => {
    expect(() => VisionIndexJobCreateSchema.parse({
      organization_id: orgId,
      vision_page_ids: Array.from({ length: 501 }, () => pageId),
    })).toThrow()
  })

  it('rejects unknown gpu_host value', () => {
    expect(() => VisionIndexJobCreateSchema.parse({
      organization_id: orgId,
      vision_page_ids: [pageId],
      gpu_host: 'azure' as any,
    })).toThrow()
  })

  it.each(['modal', 'replicate', 'runpod', 'colab', 'stub'] as const)(
    'accepts gpu_host=%s',
    (host) => {
      expect(VisionIndexJobCreateSchema.parse({
        organization_id: orgId,
        vision_page_ids: [pageId],
        gpu_host: host,
      }).gpu_host).toBe(host)
    },
  )
})

// ─── State-machine tests ──────────────────────────────────────────────

describe('isLegalVisionPageTransition', () => {
  it.each([
    ['pending', 'rendering'],
    ['rendering', 'embedding'],
    ['embedding', 'indexed'],
    ['embedding', 'review_required'],
    ['failed', 'pending'],
    ['indexed', 'embedding'],   // re-embed allowed
  ])('allows %s → %s', (from, to) => {
    expect(isLegalVisionPageTransition(from as any, to as any)).toBe(true)
  })

  it.each([
    ['pending', 'indexed'],     // can't skip rendering+embedding
    ['indexed', 'pending'],     // can't go back to pending without explicit retry
    ['rendering', 'review_required'],   // review is post-embed only
  ])('rejects %s → %s', (from, to) => {
    expect(isLegalVisionPageTransition(from as any, to as any)).toBe(false)
  })
})

describe('isLegalVisionJobTransition', () => {
  it('allows queued → running → completed', () => {
    expect(isLegalVisionJobTransition('queued', 'running')).toBe(true)
    expect(isLegalVisionJobTransition('running', 'completed')).toBe(true)
  })

  it('rejects completed → anything (terminal)', () => {
    expect(isLegalVisionJobTransition('completed', 'queued')).toBe(false)
    expect(isLegalVisionJobTransition('completed', 'running')).toBe(false)
  })

  it('allows failed → queued (retry path)', () => {
    expect(isLegalVisionJobTransition('failed', 'queued')).toBe(true)
  })
})

// ─── CRUD tests with a mock Supabase client ───────────────────────────
//
// The mock builds a chainable that records every method call so the
// test can assert which filters were applied.

interface CallLog {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

function makeMockSupabase(opts: {
  selectResult?: { data: unknown; error: unknown }
  insertResult?: { data: unknown; error: unknown }
  updateResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: CallLog[] = []

  function makeChain(table: string) {
    const log: CallLog = { table, ops: [] }
    calls.push(log)

    const chain: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          // Resolve based on which mutation method was called last.
          const lastMutation = [...log.ops].reverse().find(
            (o) => ['insert', 'update', 'select'].includes(o.method),
          )?.method
          const result =
            lastMutation === 'insert' ? opts.insertResult :
            lastMutation === 'update' ? opts.updateResult :
            opts.selectResult ?? { data: [], error: null }
          return (resolve: (v: unknown) => void) => resolve(result)
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

describe('listVisionPages — org isolation', () => {
  it('always filters by organization_id', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })

    await listVisionPages(client, 'org-A')
    const log = calls.find((c) => c.table === 'vision_pages')
    expect(log).toBeDefined()
    const eqCalls = log!.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'organization_id' && o.args[1] === 'org-A'))
      .toBe(true)
  })

  it('excludes soft-deleted rows by default', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })

    await listVisionPages(client, 'org-A')
    const log = calls.find((c) => c.table === 'vision_pages')!
    const isCalls = log.ops.filter((o) => o.method === 'is')
    expect(isCalls.some((o) => o.args[0] === 'deleted_at' && o.args[1] === null)).toBe(true)
  })

  it('includes soft-deleted rows when include_deleted=true', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })

    await listVisionPages(client, 'org-A', { include_deleted: true })
    const log = calls.find((c) => c.table === 'vision_pages')!
    const isCalls = log.ops.filter((o) => o.method === 'is')
    expect(isCalls.some((o) => o.args[0] === 'deleted_at')).toBe(false)
  })

  it('forwards a status filter', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })

    await listVisionPages(client, 'org-A', { status: 'pending' })
    const log = calls.find((c) => c.table === 'vision_pages')!
    expect(log.ops.some((o) =>
      o.method === 'eq' && o.args[0] === 'status' && o.args[1] === 'pending'
    )).toBe(true)
  })
})

describe('getVisionPage — org isolation', () => {
  it('filters by both id AND organization_id', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })

    await getVisionPage(client, 'page-1', 'org-A')
    const log = calls.find((c) => c.table === 'vision_pages')!
    const eqByCol = new Map(log.ops.filter((o) => o.method === 'eq').map((o) => [o.args[0], o.args[1]]))
    expect(eqByCol.get('id')).toBe('page-1')
    expect(eqByCol.get('organization_id')).toBe('org-A')
  })

  it('returns null on not-found (maybeSingle returned null)', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })
    const result = await getVisionPage(client, 'page-1', 'org-A')
    expect(result).toBeNull()
  })

  it('throws on supabase error', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: { message: 'boom' } },
    })
    await expect(getVisionPage(client, 'page-1', 'org-A')).rejects.toThrow(/boom/)
  })
})

describe('softDeleteVisionPage', () => {
  it('updates deleted_at to a timestamp and filters by org', async () => {
    const { client, calls } = makeMockSupabase({
      updateResult: { data: null, error: null },
    })
    await softDeleteVisionPage(client, 'page-1', 'org-A')
    const log = calls.find((c) => c.table === 'vision_pages')!
    const updateOp = log.ops.find((o) => o.method === 'update')
    expect((updateOp?.args[0] as { deleted_at: string }).deleted_at).toBeTruthy()
    expect(log.ops.some((o) =>
      o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 'org-A'
    )).toBe(true)
  })
})

describe('createVisionPage — schema enforcement', () => {
  it('rejects payload before hitting Supabase', async () => {
    const { client, calls } = makeMockSupabase({
      insertResult: { data: null, error: null },
    })
    await expect(createVisionPage(client, {
      organization_id: 'not-uuid',
      source_document_id: '00000000-0000-0000-0000-000000000002',
      page_number: 0,
      page_image_path: 'p.png',
    })).rejects.toThrow()
    expect(calls.find((c) => c.table === 'vision_pages')).toBeUndefined()
  })
})

describe('updateVisionIndexJob — illegal transition guard', () => {
  it('rejects completed → running', async () => {
    // The service does TWO supabase calls when status is patched:
    //   1. getVisionIndexJob() — read current row
    //   2. update() if transition is legal
    // We make from() return a chain whose `then` resolves to the SAME
    // current-state row on every call. The illegal-transition check
    // fires after the first read, so the second update never executes —
    // resolving to the read result on either call is fine.
    const currentRow = { id: 'job-1', organization_id: 'org-A', status: 'completed' }
    const client: any = {
      from: () => {
        const chain: any = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: currentRow, error: null })
            }
            return () => chain   // ← every chained method returns SELF
          },
        })
        return chain
      },
    }

    await expect(updateVisionIndexJob(
      client,
      'job-1',
      { status: 'running' },
      'org-A',
    )).rejects.toThrow(/illegal transition/)
  })
})
