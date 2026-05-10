/**
 * Phase 17 Sprint 17.4 — webhook dedup tests.
 *
 * - Fresh event → duplicate=false, row inserted.
 * - PK collision (already received) → duplicate=true, no throw.
 * - Other errors → bubble up so Stripe retries the delivery.
 */
import { describe, it, expect } from 'vitest'

import { recordReceived } from './stripe-webhook-dedup'

function makeSb(insertResult: { error: any | null }) {
  return {
    from: () => ({
      insert: () => Promise.resolve(insertResult),
    }),
  } as any
}

function makeSbForUpdate() {
  // Used by other tests if needed.
  return makeSb({ error: null })
}

describe('recordReceived', () => {
  const event = {
    id: 'evt_123',
    type: 'customer.subscription.updated',
    livemode: false,
    api_version: '2024-04-10',
    payload: { foo: 'bar' },
  }

  it('inserts on first delivery', async () => {
    const r = await recordReceived(makeSb({ error: null }), event)
    expect(r).toEqual({ duplicate: false, event_id: 'evt_123' })
  })

  it('treats Postgres unique-violation (23505) as duplicate', async () => {
    const r = await recordReceived(
      makeSb({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
      event,
    )
    expect(r).toEqual({ duplicate: true, event_id: 'evt_123' })
  })

  it('treats "duplicate key" message as duplicate even without code', async () => {
    const r = await recordReceived(
      makeSb({ error: { message: 'duplicate key on PK' } }),
      event,
    )
    expect(r.duplicate).toBe(true)
  })

  it('throws on non-duplicate errors so Stripe will retry', async () => {
    const r = recordReceived(
      makeSb({ error: { code: '42P01', message: 'relation "stripe_webhook_events" does not exist' } }),
      event,
    )
    await expect(r).rejects.toMatchObject({ code: '42P01' })
  })
})

void makeSbForUpdate
