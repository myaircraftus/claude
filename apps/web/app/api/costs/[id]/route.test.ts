/**
 * Phase 15.5 Task 4 — /api/costs/[id] PATCH zod refactor.
 *
 * Verifies the omitted-vs-null-vs-value semantics that closes the
 * security-audit §5.4 gap on this route. The previous implementation
 * used `'X' in body` after `await req.json()` — same intent but no
 * input validation. Now: zod schema + parsePatchBody helper retains
 * which keys the caller explicitly sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase BEFORE importing the route.
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(),
}))

import { PATCH } from './route'
import { createServerSupabase } from '@/lib/supabase/server'

interface MockRowSnapshot {
  id: string
  category: string
  amount: number
  notes: string | null
}

function makeSb(initial: MockRowSnapshot, opts: { role?: string } = {}) {
  // Last update payload captured for assertion.
  const captured: { update?: Record<string, unknown> } = {}
  let row = { ...initial }
  return {
    captured,
    sb: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organization_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { organization_id: 'org-1', role: opts.role ?? 'mechanic' },
            }),
          }
        }
        if (table === 'cost_entries') {
          // Builder returned for both .update().eq().eq().select().maybeSingle()
          // and .select().eq().eq().maybeSingle() (the empty-body branch).
          const builder = {
            update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              captured.update = payload
              row = { ...row, ...(payload as Partial<MockRowSnapshot>) }
              return builder
            }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: row }),
          }
          return builder
        }
        return {} as any
      }),
    } as any,
  }
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/costs/c1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/costs/[id]', () => {
  it('empty body → no UPDATE issued, returns current row', async () => {
    const { sb, captured } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: null })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({}), { params: { id: 'c1' } })
    expect(res!.status).toBe(200)
    expect(captured.update).toBeUndefined()
    const json = await res!.json()
    expect(json.entry.id).toBe('c1')
  })

  it('one field → only that field + updated_at in patch', async () => {
    const { sb, captured } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: null })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ category: 'oil' }), { params: { id: 'c1' } })
    expect(res!.status).toBe(200)
    expect(captured.update).toBeDefined()
    expect(Object.keys(captured.update!).sort()).toEqual(['category', 'updated_at'])
    expect(captured.update!.category).toBe('oil')
  })

  it('explicit null → field set to null', async () => {
    const { sb, captured } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: 'old' })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ notes: null }), { params: { id: 'c1' } })
    expect(res!.status).toBe(200)
    expect(captured.update!.notes).toBeNull()
  })

  it('omitted field → field unchanged (not in patch)', async () => {
    const { sb, captured } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: 'keep' })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ category: 'oil' }), { params: { id: 'c1' } })
    expect(res!.status).toBe(200)
    expect(captured.update).toBeDefined()
    expect('notes' in captured.update!).toBe(false)
  })

  it('invalid type (amount = "abc") → 400 with zod error', async () => {
    const { sb } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: null })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ amount: 'abc' }), { params: { id: 'c1' } })
    expect(res!.status).toBe(400)
    const json = await res!.json()
    expect(json.error).toMatch(/Validation failed at amount/)
  })

  it('invalid bucket enum → 400', async () => {
    const { sb } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: null })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ bucket: 'not_a_bucket' }), { params: { id: 'c1' } })
    expect(res!.status).toBe(400)
  })

  it('amount rounded to 2 decimals when sent', async () => {
    const { sb, captured } = makeSb({ id: 'c1', category: 'fuel', amount: 100, notes: null })
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ amount: 12.345 }), { params: { id: 'c1' } })
    expect(res!.status).toBe(200)
    expect(captured.update!.amount).toBe(12.35)
  })

  it('insufficient role → 403', async () => {
    const { sb } = makeSb(
      { id: 'c1', category: 'fuel', amount: 100, notes: null },
      { role: 'viewer' },
    )
    ;(createServerSupabase as any).mockReturnValue(sb)

    const res = await PATCH(makeReq({ amount: 1 }), { params: { id: 'c1' } })
    expect(res!.status).toBe(403)
  })
})
