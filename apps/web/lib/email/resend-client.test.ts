/**
 * Phase 17 Sprint 17.1 — Resend client tests.
 *
 * Validates:
 * - Missing RESEND_API_KEY → ok=false, retriable=false (no fetch call).
 * - Successful 200 with id → ok=true.
 * - 4xx (validation) → permanent fail with error captured.
 * - 5xx → marked retriable=true after exhausting backoff.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

import { sendEmail } from './resend-client'

const ORIG_KEY = process.env.RESEND_API_KEY
const ORIG_FETCH = global.fetch

afterEach(() => {
  process.env.RESEND_API_KEY = ORIG_KEY
  global.fetch = ORIG_FETCH
  vi.useRealTimers()
})

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test_xyz'
})

describe('sendEmail', () => {
  it('refuses to send without RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY
    const fetchMock = vi.fn()
    global.fetch = fetchMock as any
    const r = await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })
    expect(r.ok).toBe(false)
    expect(r.retriable).toBe(false)
    expect(r.error).toMatch(/RESEND_API_KEY missing/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns ok with id on a 200 response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg-123' }),
    })) as any
    const r = await sendEmail({ to: 'a@b.com', subject: 's', text: 't' })
    expect(r).toEqual({ ok: true, id: 'msg-123', status: 200 })
  })

  it('marks a 4xx as permanent failure (no retry)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ message: 'invalid_email' }),
    }))
    global.fetch = fetchMock as any
    const r = await sendEmail({ to: 'bad', subject: 's', text: 't' })
    expect(r.ok).toBe(false)
    expect(r.retriable).toBe(false)
    expect(r.status).toBe(422)
    expect(r.error).toBe('invalid_email')
    expect(fetchMock).toHaveBeenCalledTimes(1)  // no retry
  })

  it('retries on 5xx and marks retriable after exhausting backoff', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: 'upstream_unavailable' }),
    }))
    global.fetch = fetchMock as any

    const promise = sendEmail({ to: 'a@b.com', subject: 's', text: 't' })
    // Drain 4 attempts (initial + 3 retries with cumulative backoff < 2s)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(1100)
    }
    const r = await promise
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(r.ok).toBe(false)
    expect(r.retriable).toBe(true)
    expect(r.error).toContain('upstream_unavailable')
  })
})
