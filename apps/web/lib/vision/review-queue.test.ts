/**
 * Sprint 8.7 — review queue + feedback service tests.
 *
 * Coverage:
 *   1. Schemas (ReviewItemCreateSchema, FeedbackSchema, ReviewItemPatchSchema)
 *   2. State-machine guard (isLegalReviewTransition)
 *   3. Org isolation: every CRUD operation filters by organization_id
 *   4. markReviewed throws on illegal transitions
 *   5. Feedback aggregate sums ratings correctly
 *   6. enqueueLowConfidence + enqueueFailedIndex helpers don't throw
 *      on insert error (auto-enqueue is best-effort)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ReviewItemCreateSchema,
  ReviewItemPatchSchema,
  FeedbackSchema,
  isLegalReviewTransition,
  listReviewQueue,
  getReviewItem,
  addToReviewQueue,
  markReviewed,
  enqueueLowConfidence,
  enqueueFailedIndex,
  submitFeedback,
  getFeedbackAggregate,
} from './review-queue'

const ORG_A = '00000000-0000-0000-0000-00000000000a'
const ORG_B = '00000000-0000-0000-0000-00000000000b'
const PAGE_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID = '22222222-2222-2222-2222-222222222222'
const REVIEW_ID = '33333333-3333-3333-3333-333333333333'

// ─── Schema tests ─────────────────────────────────────────────────────

describe('ReviewItemCreateSchema', () => {
  const valid = {
    organization_id: ORG_A,
    vision_page_id: PAGE_ID,
    search_query: 'annual inspection',
    confidence_score: 0.25,
    reason: 'low_confidence' as const,
  }

  it('accepts a fully populated payload', () => {
    expect(ReviewItemCreateSchema.parse(valid)).toMatchObject(valid)
  })

  it('accepts minimal payload (no query/score)', () => {
    expect(ReviewItemCreateSchema.parse({
      organization_id: ORG_A,
      vision_page_id: PAGE_ID,
      reason: 'failed_index',
    })).toBeTruthy()
  })

  it('rejects unknown reason', () => {
    expect(() => ReviewItemCreateSchema.parse({ ...valid, reason: 'magical' as any }))
      .toThrow()
  })

  it('rejects non-uuid org', () => {
    expect(() => ReviewItemCreateSchema.parse({ ...valid, organization_id: 'not-a-uuid' }))
      .toThrow()
  })

  it('rejects confidence_score > 1', () => {
    expect(() => ReviewItemCreateSchema.parse({ ...valid, confidence_score: 1.5 })).toThrow()
  })

  it('rejects confidence_score < 0', () => {
    expect(() => ReviewItemCreateSchema.parse({ ...valid, confidence_score: -0.1 })).toThrow()
  })
})

describe('ReviewItemPatchSchema', () => {
  it.each(['pending', 'reviewed_ok', 'reviewed_problem', 'dismissed'] as const)(
    'accepts status=%s',
    (s) => {
      expect(ReviewItemPatchSchema.parse({ status: s }).status).toBe(s)
    },
  )

  it('rejects unknown status', () => {
    expect(() => ReviewItemPatchSchema.parse({ status: 'magical' as any })).toThrow()
  })

  it('accepts null reviewer_notes', () => {
    expect(ReviewItemPatchSchema.parse({ reviewer_notes: null }).reviewer_notes).toBeNull()
  })
})

describe('FeedbackSchema', () => {
  const valid = {
    organization_id: ORG_A,
    search_query: 'engine logbook',
    vision_page_id: PAGE_ID,
    rating: 1 as const,
    user_id: USER_ID,
  }

  it.each([-1, 0, 1] as const)('accepts rating=%d', (r) => {
    expect(FeedbackSchema.parse({ ...valid, rating: r }).rating).toBe(r)
  })

  it('rejects rating=2', () => {
    expect(() => FeedbackSchema.parse({ ...valid, rating: 2 as any })).toThrow()
  })

  it('rejects empty search_query', () => {
    expect(() => FeedbackSchema.parse({ ...valid, search_query: '' })).toThrow()
  })

  it('rejects > 2000 char search_query', () => {
    expect(() => FeedbackSchema.parse({ ...valid, search_query: 'a'.repeat(2001) })).toThrow()
  })
})

// ─── State machine ────────────────────────────────────────────────────

describe('isLegalReviewTransition', () => {
  it.each([
    ['pending', 'reviewed_ok'],
    ['pending', 'reviewed_problem'],
    ['pending', 'dismissed'],
    ['dismissed', 'pending'],
  ])('allows %s → %s', (from, to) => {
    expect(isLegalReviewTransition(from as any, to as any)).toBe(true)
  })

  it.each([
    ['reviewed_ok', 'pending'],
    ['reviewed_ok', 'reviewed_problem'],
    ['reviewed_problem', 'pending'],
    ['reviewed_problem', 'dismissed'],
    ['pending', 'pending'],
    ['dismissed', 'reviewed_ok'],
  ])('rejects %s → %s', (from, to) => {
    expect(isLegalReviewTransition(from as any, to as any)).toBe(false)
  })
})

// ─── Mock Supabase client ─────────────────────────────────────────────

interface CallLog {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

function makeMockSupabase(opts: {
  selectResult?: { data: unknown; error: unknown; count?: number }
  insertResult?: { data: unknown; error: unknown; count?: number }
  updateResult?: { data: unknown; error: unknown }
  upsertResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: CallLog[] = []

  function makeChain(table: string) {
    const log: CallLog = { table, ops: [] }
    calls.push(log)

    const chain: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          // Mutation methods take priority over read methods (select,
          // single, maybeSingle), since the real chain is
          //   .insert(...).select('*').single()
          // and the test wants the mutation result.
          const methods = log.ops.map((o) => o.method)
          const fallback = { data: null, error: null }
          const result =
            methods.includes('insert') ? opts.insertResult ?? fallback :
            methods.includes('update') ? opts.updateResult ?? fallback :
            methods.includes('upsert') ? opts.upsertResult ?? fallback :
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

// ─── Org isolation tests ──────────────────────────────────────────────

describe('listReviewQueue — org isolation', () => {
  it('filters by organization_id', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await listReviewQueue(client, ORG_A)
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const eqCalls = log.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'organization_id' && o.args[1] === ORG_A))
      .toBe(true)
  })

  it('excludes soft-deleted rows by default', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await listReviewQueue(client, ORG_A)
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const isCalls = log.ops.filter((o) => o.method === 'is')
    expect(isCalls.some((o) => o.args[0] === 'deleted_at' && o.args[1] === null)).toBe(true)
  })

  it('forwards a single status filter via .eq()', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await listReviewQueue(client, ORG_A, { status: 'pending' })
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const eqCalls = log.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'status' && o.args[1] === 'pending')).toBe(true)
  })

  it('forwards an array status filter via .in()', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await listReviewQueue(client, ORG_A, { status: ['reviewed_ok', 'reviewed_problem'] })
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const inCalls = log.ops.filter((o) => o.method === 'in')
    expect(inCalls.some((o) =>
      o.args[0] === 'status' &&
      Array.isArray(o.args[1]) &&
      (o.args[1] as string[]).includes('reviewed_ok'),
    )).toBe(true)
  })

  it('forwards a reason filter', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await listReviewQueue(client, ORG_A, { reason: 'failed_index' })
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const eqCalls = log.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'reason' && o.args[1] === 'failed_index'))
      .toBe(true)
  })

  it('throws when supabase reports an error', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: { message: 'boom' } },
    })
    await expect(listReviewQueue(client, ORG_A)).rejects.toThrow(/boom/)
  })
})

describe('getReviewItem — org isolation', () => {
  it('filters by id AND organization_id', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: { id: REVIEW_ID, organization_id: ORG_A }, error: null },
    })
    await getReviewItem(client, REVIEW_ID, ORG_A)
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const eqCalls = log.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'id' && o.args[1] === REVIEW_ID)).toBe(true)
    expect(eqCalls.some((o) => o.args[0] === 'organization_id' && o.args[1] === ORG_A))
      .toBe(true)
  })

  it('returns null when the row is in another org (no rows from filter)', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })
    const result = await getReviewItem(client, REVIEW_ID, ORG_B)
    expect(result).toBeNull()
  })
})

// ─── markReviewed transitions ─────────────────────────────────────────

describe('markReviewed', () => {
  it('throws on illegal transition (reviewed_ok → reviewed_problem)', async () => {
    // First call (getReviewItem) returns the existing terminal row.
    let callCount = 0
    const client: any = {
      from: () => {
        const log: CallLog = { table: 'vision_review_queue', ops: [] }
        const chain: any = new Proxy({}, {
          get(_t, prop) {
            if (prop === 'then') {
              callCount++
              return (resolve: (v: unknown) => void) => resolve({
                data: { id: REVIEW_ID, organization_id: ORG_A, status: 'reviewed_ok' },
                error: null,
              })
            }
            return (...args: unknown[]) => {
              log.ops.push({ method: String(prop), args })
              return chain
            }
          },
        })
        return chain
      },
    }
    await expect(
      markReviewed(client, REVIEW_ID, ORG_A, {
        status: 'reviewed_problem',
        reviewerUserId: USER_ID,
      }),
    ).rejects.toThrow(/illegal transition/)
  })

  it('throws when item is not found in this org', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })
    await expect(
      markReviewed(client, REVIEW_ID, ORG_B, {
        status: 'reviewed_ok',
        reviewerUserId: USER_ID,
      }),
    ).rejects.toThrow(/not found/)
  })
})

// ─── enqueue helpers ──────────────────────────────────────────────────

describe('enqueueLowConfidence', () => {
  let warnSpy: any

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('inserts a low_confidence row with the supplied fields', async () => {
    const { client, calls } = makeMockSupabase({
      insertResult: { data: { id: REVIEW_ID }, error: null },
    })
    await enqueueLowConfidence(client, {
      organizationId: ORG_A,
      visionPageId: PAGE_ID,
      searchQuery: 'engine inspection',
      confidenceScore: 0.18,
    })
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const insertCall = log.ops.find((o) => o.method === 'insert')
    expect(insertCall).toBeDefined()
    const payload = insertCall!.args[0] as any
    expect(payload.organization_id).toBe(ORG_A)
    expect(payload.vision_page_id).toBe(PAGE_ID)
    expect(payload.reason).toBe('low_confidence')
    expect(payload.confidence_score).toBe(0.18)
    expect(payload.search_query).toBe('engine inspection')
  })

  it('swallows insert errors (best-effort path)', async () => {
    const { client } = makeMockSupabase({
      insertResult: { data: null, error: { message: 'unique violation' } },
    })
    await expect(enqueueLowConfidence(client, {
      organizationId: ORG_A,
      visionPageId: PAGE_ID,
      searchQuery: 'q',
      confidenceScore: 0.1,
    })).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('enqueueFailedIndex', () => {
  let warnSpy: any

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('returns 0 inserted when given empty page list', async () => {
    const { client } = makeMockSupabase({})
    const result = await enqueueFailedIndex(client, {
      organizationId: ORG_A,
      visionPageIds: [],
    })
    expect(result.inserted).toBe(0)
  })

  it('inserts one row per page id with reason=failed_index', async () => {
    const ids = [PAGE_ID, '11111111-1111-1111-1111-111111111112']
    const { client, calls } = makeMockSupabase({
      insertResult: { data: null, error: null, count: ids.length },
    })
    const result = await enqueueFailedIndex(client, {
      organizationId: ORG_A,
      visionPageIds: ids,
    })
    expect(result.inserted).toBe(ids.length)
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    const insertCall = log.ops.find((o) => o.method === 'insert')
    expect(insertCall).toBeDefined()
    const rows = insertCall!.args[0] as any[]
    expect(rows.length).toBe(ids.length)
    expect(rows.every((r) => r.reason === 'failed_index')).toBe(true)
    expect(rows.every((r) => r.organization_id === ORG_A)).toBe(true)
  })

  it('returns inserted=0 on supabase error and logs warning', async () => {
    const { client } = makeMockSupabase({
      insertResult: { data: null, error: { message: 'rls denied' } },
    })
    const result = await enqueueFailedIndex(client, {
      organizationId: ORG_A,
      visionPageIds: [PAGE_ID],
    })
    expect(result.inserted).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
  })
})

// ─── feedback ─────────────────────────────────────────────────────────

describe('submitFeedback', () => {
  it('upserts on the (user, query, page) unique index', async () => {
    const { client, calls } = makeMockSupabase({
      upsertResult: {
        data: {
          id: 'fb-1',
          organization_id: ORG_A,
          search_query: 'q',
          vision_page_id: PAGE_ID,
          rating: 1,
          user_id: USER_ID,
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    })
    await submitFeedback(client, {
      organization_id: ORG_A,
      search_query: 'q',
      vision_page_id: PAGE_ID,
      rating: 1,
      user_id: USER_ID,
    })
    const log = calls.find((c) => c.table === 'vision_feedback')!
    const upsertCall = log.ops.find((o) => o.method === 'upsert')
    expect(upsertCall).toBeDefined()
    const opts = upsertCall!.args[1] as any
    expect(opts?.onConflict).toBe('user_id,search_query,vision_page_id')
  })

  it('throws when supabase reports an error', async () => {
    const { client } = makeMockSupabase({
      upsertResult: { data: null, error: { message: 'rls denied' } },
    })
    await expect(submitFeedback(client, {
      organization_id: ORG_A,
      search_query: 'q',
      vision_page_id: PAGE_ID,
      rating: 1,
      user_id: USER_ID,
    })).rejects.toThrow(/rls denied/)
  })
})

describe('getFeedbackAggregate', () => {
  it('sums ratings across multiple raters', async () => {
    const { client } = makeMockSupabase({
      selectResult: {
        data: [{ rating: 1 }, { rating: 1 }, { rating: -1 }, { rating: 0 }],
        error: null,
      },
    })
    const agg = await getFeedbackAggregate(client, ORG_A, 'q', PAGE_ID)
    expect(agg.totalRating).toBe(1) // 1 + 1 + -1 + 0
    expect(agg.raterCount).toBe(4)
  })

  it('returns zeros when no feedback exists', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    const agg = await getFeedbackAggregate(client, ORG_A, 'q', PAGE_ID)
    expect(agg).toEqual({ totalRating: 0, raterCount: 0 })
  })

  it('always filters by organization_id, search_query, and vision_page_id', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await getFeedbackAggregate(client, ORG_A, 'engine inspection', PAGE_ID)
    const log = calls.find((c) => c.table === 'vision_feedback')!
    const eqCalls = log.ops.filter((o) => o.method === 'eq')
    expect(eqCalls.some((o) => o.args[0] === 'organization_id' && o.args[1] === ORG_A))
      .toBe(true)
    expect(eqCalls.some((o) => o.args[0] === 'search_query' && o.args[1] === 'engine inspection'))
      .toBe(true)
    expect(eqCalls.some((o) => o.args[0] === 'vision_page_id' && o.args[1] === PAGE_ID))
      .toBe(true)
  })
})

// ─── Generic CRUD smoke ───────────────────────────────────────────────

describe('addToReviewQueue', () => {
  it('inserts validated payload', async () => {
    const inserted = {
      id: REVIEW_ID,
      organization_id: ORG_A,
      vision_page_id: PAGE_ID,
      search_query: 'q',
      confidence_score: 0.2,
      reason: 'low_confidence',
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    const { client, calls } = makeMockSupabase({
      insertResult: { data: inserted, error: null },
    })
    const result = await addToReviewQueue(client, {
      organization_id: ORG_A,
      vision_page_id: PAGE_ID,
      search_query: 'q',
      confidence_score: 0.2,
      reason: 'low_confidence',
    })
    expect(result).toMatchObject({ id: REVIEW_ID, organization_id: ORG_A })
    const log = calls.find((c) => c.table === 'vision_review_queue')!
    expect(log.ops.some((o) => o.method === 'insert')).toBe(true)
  })

  it('rejects payload with bad reason at the schema level', async () => {
    const { client } = makeMockSupabase({})
    await expect(
      addToReviewQueue(client, {
        organization_id: ORG_A,
        vision_page_id: PAGE_ID,
        reason: 'magical' as any,
      } as any),
    ).rejects.toThrow()
  })
})
