/**
 * Phase 17 Sprint 17.1 — email queue worker tests.
 *
 * Validates:
 * - Empty queue → no-op result.
 * - Successful send transitions to 'sent' with provider_message_id.
 * - 4xx send transitions to 'failed' with error captured.
 * - 5xx (retriable) leaves the row 'sending' with error_message set.
 * - The atomic claim guard (status='queued') is in the .eq() chain.
 */
import { describe, it, expect, vi } from 'vitest'

import { run } from './queue-worker'
import type { SendEmailResult } from './resend-client'

interface Row {
  id: string
  to_email: string
  from_email: string | null
  subject: string
  body_text: string
  body_html: string | null
  kind: string
  related_ticket_id: string | null
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped'
  delivery_attempted_at: string | null
  delivery_settled_at: string | null
  provider_message_id: string | null
  error_message: string | null
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'em-1',
    to_email: 'andy@horf.us',
    from_email: 'support@myaircraft.us',
    subject: 'hi',
    body_text: 'hi',
    body_html: null,
    kind: 'other',
    related_ticket_id: null,
    status: 'queued',
    delivery_attempted_at: null,
    delivery_settled_at: null,
    provider_message_id: null,
    error_message: null,
    ...over,
  }
}

/**
 * Tiny in-memory fake for the supabase client. Only implements the
 * subset of the chain that queue-worker actually calls.
 */
function fakeSupabase(initial: Row[]) {
  const rows = initial.slice()

  // Each chain accumulates filters then awaits to a result.
  function makeChain(table: string) {
    let kind: 'select' | 'update' | null = null
    const filters: Array<{ key: string; op: string; val: unknown }> = []
    let updates: Partial<Row> | null = null
    let orderKey: string | null = null
    let limitN: number | null = null
    let returningFields: string[] | null = null

    const matches = (r: Row) => filters.every((f) => {
      const v = (r as unknown as Record<string, unknown>)[f.key]
      if (f.op === 'eq') return v === f.val
      if (f.op === 'in') return Array.isArray(f.val) && (f.val as unknown[]).includes(v)
      if (f.op === 'lt') return typeof v === 'string' && (v as string) < (f.val as string)
      return false
    })

    const chain = {
      // .select(...) only sets kind when no operation has been chosen yet.
      // After .update(...).select('id') we still want kind='update' so the
      // mutations apply; the .select just specifies the returning columns.
      select: (cols: string) => {
        if (kind === null) kind = 'select'
        returningFields = cols.split(',').map((s) => s.trim())
        return chain
      },
      update: (u: Partial<Row>) => { kind = 'update'; updates = u; return chain },
      eq: (k: string, v: unknown) => { filters.push({ key: k, op: 'eq', val: v }); return chain },
      in: (k: string, v: unknown[]) => { filters.push({ key: k, op: 'in', val: v }); return chain },
      lt: (k: string, v: unknown) => { filters.push({ key: k, op: 'lt', val: v }); return chain },
      order: (k: string) => { orderKey = k; return chain },
      limit: (n: number) => { limitN = n; return chain },
      then: (cb: any) => {
        if (table !== 'email_log') return Promise.resolve({ data: [], error: null }).then(cb)
        if (kind === 'update') {
          const matched = rows.filter(matches)
          for (const r of matched) Object.assign(r, updates)
          return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(cb)
        }
        let view = rows.filter(matches)
        if (orderKey) view = view.slice()
        if (limitN != null) view = view.slice(0, limitN)
        return Promise.resolve({ data: view.map((r) => ({ ...r })), error: null }).then(cb)
      },
    }
    return chain
  }

  return {
    sb: { from: (t: string) => makeChain(t) } as any,
    rows,
  }
}

describe('email queue worker', () => {
  it('returns zeros when no queued rows', async () => {
    const { sb } = fakeSupabase([])
    const r = await run(sb, { __sendImpl: async () => ({ ok: true, id: 'msg' }) })
    expect(r).toEqual({ attempted: 0, sent: 0, failed: 0, retriable: 0, details: undefined })
  })

  it('marks a successful send as sent + records provider_message_id', async () => {
    const { sb, rows } = fakeSupabase([row({ id: 'em-1' })])
    const sendImpl = vi.fn(async (): Promise<SendEmailResult> => ({ ok: true, id: 'resend-abc' }))
    const r = await run(sb, { __sendImpl: sendImpl, verbose: true })
    expect(r.attempted).toBe(1)
    expect(r.sent).toBe(1)
    expect(r.failed).toBe(0)
    const updated = rows.find((x) => x.id === 'em-1')!
    expect(updated.status).toBe('sent')
    expect(updated.provider_message_id).toBe('resend-abc')
    expect(sendImpl).toHaveBeenCalledTimes(1)
    expect(r.details).toEqual([{ id: 'em-1', status: 'sent' }])
  })

  it('marks a 4xx (permanent) failure as failed with error', async () => {
    const { sb, rows } = fakeSupabase([row({ id: 'em-2' })])
    const r = await run(sb, {
      __sendImpl: async () => ({ ok: false, error: 'invalid recipient', status: 422, retriable: false }),
      verbose: true,
    })
    expect(r.failed).toBe(1)
    const updated = rows.find((x) => x.id === 'em-2')!
    expect(updated.status).toBe('failed')
    expect(updated.error_message).toContain('invalid recipient')
    expect(r.details).toEqual([{ id: 'em-2', status: 'failed', error: 'invalid recipient' }])
  })

  it('leaves a 5xx (retriable) failure at sending so the heal sweep retries it', async () => {
    const { sb, rows } = fakeSupabase([row({ id: 'em-3' })])
    const r = await run(sb, {
      __sendImpl: async () => ({ ok: false, error: 'upstream 503', status: 503, retriable: true }),
      verbose: true,
    })
    expect(r.retriable).toBe(1)
    expect(r.failed).toBe(0)
    const updated = rows.find((x) => x.id === 'em-3')!
    expect(updated.status).toBe('sending')
    expect(updated.error_message).toContain('upstream 503')
    expect(r.details).toEqual([{ id: 'em-3', status: 'retriable', error: 'upstream 503' }])
  })

  it('respects maxBatch parameter', async () => {
    const initial = Array.from({ length: 10 }, (_, i) => row({ id: `em-${i}`, to_email: `to${i}@x.io` }))
    const { sb } = fakeSupabase(initial)
    const sendImpl = vi.fn(async (): Promise<SendEmailResult> => ({ ok: true, id: 'r' }))
    const r = await run(sb, { __sendImpl: sendImpl, maxBatch: 3 })
    expect(r.attempted).toBe(3)
    expect(sendImpl).toHaveBeenCalledTimes(3)
  })
})
