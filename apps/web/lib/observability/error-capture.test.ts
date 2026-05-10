/**
 * Phase 16 Sprint 16.5 — error capture tests.
 *
 * Verifies the stack-hash grouping logic, recordErrorEvent's
 * insert-vs-update path, and the rate-spike alert auto-fire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  computeStackHash,
  recordErrorEvent,
  ERROR_RATE_ALERT_THRESHOLD,
} from './error-capture'

describe('computeStackHash', () => {
  it('produces a 16-char hex hash', () => {
    const h = computeStackHash('boom', 'Error: boom\n  at /app/foo.tsx:42:7')
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('groups errors with different line numbers', () => {
    const a = computeStackHash('boom', 'Error: boom\n  at /app/foo.tsx:42:7')
    const b = computeStackHash('boom', 'Error: boom\n  at /app/foo.tsx:99:13')
    expect(a).toBe(b)
  })

  it('groups errors with different chunk hashes', () => {
    const a = computeStackHash('boom', 'at /_next/static/chunks/main-app-abcd1234.js:1:1')
    const b = computeStackHash('boom', 'at /_next/static/chunks/main-app-deadbeef99.js:1:1')
    expect(a).toBe(b)
  })

  it('separates errors with different messages', () => {
    const a = computeStackHash('boom', 'stack')
    const b = computeStackHash('different', 'stack')
    expect(a).not.toBe(b)
  })

  it('separates errors with different paths', () => {
    const a = computeStackHash('boom', 'at /app/foo.tsx:1:1')
    const b = computeStackHash('boom', 'at /app/bar.tsx:1:1')
    expect(a).not.toBe(b)
  })

  it('handles missing stack', () => {
    expect(computeStackHash('boom', null)).toMatch(/^[0-9a-f]{16}$/)
    expect(computeStackHash('boom', undefined)).toMatch(/^[0-9a-f]{16}$/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// recordErrorEvent — supabase mock
// ──────────────────────────────────────────────────────────────────────

interface MockState {
  /** Existing rows by stack_hash. Captures one "most recent" entry. */
  existing: Record<string, { id: string; occurrence_count: number; last_seen_at: string }>
  inserts: Array<Record<string, unknown>>
  updates: Array<{ id: string; payload: Record<string, unknown> }>
  alerts: Array<Record<string, unknown>>
}

function makeSb(state: MockState) {
  function builderFor(table: string) {
    const builder: any = {
      _eqFilters: {} as Record<string, unknown>,
      _gteFilter: undefined as string | undefined,
      _orderField: undefined as string | undefined,
      _limit: 1,
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        builder._eqFilters[col] = val
        return builder
      }),
      gte: vi.fn().mockImplementation((col: string, val: string) => {
        builder._gteFilter = val
        return builder
      }),
      order: vi.fn().mockImplementation((col: string) => {
        builder._orderField = col
        return builder
      }),
      limit: vi.fn().mockImplementation((n: number) => {
        builder._limit = n
        return builder
      }),
      maybeSingle: vi.fn().mockImplementation(async () => {
        if (table === 'error_events' && builder._eqFilters.stack_hash) {
          const row = state.existing[builder._eqFilters.stack_hash as string]
          if (row && (!builder._gteFilter || row.last_seen_at >= builder._gteFilter)) {
            return { data: row, error: null }
          }
          return { data: null, error: null }
        }
        return { data: null, error: null }
      }),
      update: vi.fn().mockImplementation((p: Record<string, unknown>) => {
        // The chain ends with .eq('id', ...) — capture that.
        const apply = () => {
          const id = builder._eqFilters.id as string
          state.updates.push({ id, payload: p })
          // Mutate the in-memory existing row so subsequent reads in the
          // same test see the new count.
          for (const k of Object.keys(state.existing)) {
            if (state.existing[k].id === id) {
              state.existing[k].occurrence_count = (p.occurrence_count as number) ?? state.existing[k].occurrence_count
              state.existing[k].last_seen_at = (p.last_seen_at as string) ?? state.existing[k].last_seen_at
            }
          }
        }
        const proxy: any = {
          eq: vi.fn().mockImplementation((col: string, val: unknown) => {
            builder._eqFilters[col] = val
            return proxy
          }),
          then: (cb: (r: { error: null }) => unknown) => {
            apply()
            return Promise.resolve({ error: null }).then(cb)
          },
        }
        return proxy
      }),
      insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
        if (table === 'error_events') {
          const id = `err-${state.inserts.length + 1}`
          state.inserts.push(p)
          state.existing[p.stack_hash as string] = {
            id,
            occurrence_count: 1,
            last_seen_at: (p.last_seen_at as string) ?? new Date().toISOString(),
          }
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
          }
        }
        if (table === 'alert_events') {
          state.alerts.push(p)
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: `alrt-${state.alerts.length}` }, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }),
    }
    return builder
  }
  return {
    from: vi.fn().mockImplementation((table: string) => builderFor(table)),
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('recordErrorEvent', () => {
  it('inserts when no recent group exists', async () => {
    const state: MockState = { existing: {}, inserts: [], updates: [], alerts: [] }
    const sb = makeSb(state)
    const r = await recordErrorEvent(sb, {
      origin: 'client',
      message: 'boom',
      stack: 'Error: boom\n  at /app/foo.tsx:42:7',
      route: '/aircraft',
    })
    expect(r.ok).toBe(true)
    expect(state.inserts).toHaveLength(1)
    expect(state.updates).toHaveLength(0)
    expect(state.alerts).toHaveLength(0)
  })

  it('updates occurrence_count when same stack_hash within 1h exists', async () => {
    const state: MockState = {
      existing: {},
      inserts: [], updates: [], alerts: [],
    }
    // Seed an existing row.
    state.existing[computeStackHash('boom', 'Error: boom\n  at /app/foo.tsx:42:7')] = {
      id: 'err-existing',
      occurrence_count: 3,
      last_seen_at: new Date().toISOString(),
    }
    const sb = makeSb(state)

    const r = await recordErrorEvent(sb, {
      origin: 'client',
      message: 'boom',
      stack: 'Error: boom\n  at /app/foo.tsx:42:7',
    })
    expect(r.ok).toBe(true)
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].id).toBe('err-existing')
    expect(state.updates[0].payload.occurrence_count).toBe(4)
  })

  it('inserts a new row when the existing group is older than 1h', async () => {
    const state: MockState = {
      existing: {},
      inserts: [], updates: [], alerts: [],
    }
    // Existing row >1h old — outside the grouping window.
    state.existing[computeStackHash('boom', 'Error: boom\n  at /app/foo.tsx:42:7')] = {
      id: 'err-stale',
      occurrence_count: 9,
      last_seen_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    }
    const sb = makeSb(state)

    await recordErrorEvent(sb, {
      origin: 'client',
      message: 'boom',
      stack: 'Error: boom\n  at /app/foo.tsx:42:7',
    })
    expect(state.inserts).toHaveLength(1)
    expect(state.updates).toHaveLength(0)
  })

  it('fires a P1 alert when occurrence_count crosses ERROR_RATE_ALERT_THRESHOLD', async () => {
    const state: MockState = {
      existing: {},
      inserts: [], updates: [], alerts: [],
    }
    state.existing[computeStackHash('boom', 'stack')] = {
      id: 'err-hot',
      occurrence_count: ERROR_RATE_ALERT_THRESHOLD,
      last_seen_at: new Date().toISOString(),
    }
    const sb = makeSb(state)
    await recordErrorEvent(sb, { origin: 'client', message: 'boom', stack: 'stack' })
    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0].alert_type).toBe('error_rate_spike')
    expect(state.alerts[0].severity).toBe('P1')
  })

  it('does not double-fire alert when threshold already crossed', async () => {
    const state: MockState = {
      existing: {},
      inserts: [], updates: [], alerts: [],
    }
    state.existing[computeStackHash('boom', 'stack')] = {
      id: 'err-hotter',
      occurrence_count: ERROR_RATE_ALERT_THRESHOLD + 5,
      last_seen_at: new Date().toISOString(),
    }
    const sb = makeSb(state)
    await recordErrorEvent(sb, { origin: 'client', message: 'boom', stack: 'stack' })
    expect(state.alerts).toHaveLength(0)
  })
})
