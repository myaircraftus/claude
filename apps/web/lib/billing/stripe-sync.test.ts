/**
 * Phase 17 Sprint 17.3 — stripe-sync helper tests.
 *
 * The full sync requires Stripe API access; these tests cover the pure
 * helpers (lookup_key + product name shape), the secret-key gate, and a
 * regression test for the bracket-syntax bug fixed mid-Sprint 17.3.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { __testing, syncPricingToStripe } from './stripe-sync'

const ORIG_KEY = process.env.STRIPE_SECRET_KEY
const ORIG_FETCH = global.fetch
afterEach(() => {
  process.env.STRIPE_SECRET_KEY = ORIG_KEY
  global.fetch = ORIG_FETCH
})

describe('stripe-sync helpers', () => {
  it('produces stable lookup keys per (tier, bracket)', () => {
    expect(__testing.lookupKeyFor('standard', 1, 5)).toBe('tier_standard_1to5_v1')
    expect(__testing.lookupKeyFor('standard', 6, 15)).toBe('tier_standard_6to15_v1')
    expect(__testing.lookupKeyFor('standard', 16, null)).toBe('tier_standard_16plus_v1')
    expect(__testing.lookupKeyFor('pro', 1, 5)).toBe('tier_pro_1to5_v1')
  })

  it('produces human-readable product names', () => {
    expect(__testing.productNameFor('standard', 1, 5)).toBe('Standard (1–5 aircraft)')
    expect(__testing.productNameFor('pro', 16, null)).toBe('Pro (16+ aircraft)')
  })

  describe('readSecret', () => {
    it('returns null when env var missing', () => {
      delete process.env.STRIPE_SECRET_KEY
      expect(__testing.readSecret()).toBeNull()
    })

    it('returns null for the sk_placeholder stub', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_placeholder_phase14_mock'
      expect(__testing.readSecret()).toBeNull()
    })

    it('returns a real-looking sk_test_ key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_abc123xyz'
      expect(__testing.readSecret()).toBe('sk_test_abc123xyz')
    })
  })

  describe('isTestKey', () => {
    it('flags sk_test_ as test', () => {
      expect(__testing.isTestKey('sk_test_abc')).toBe(true)
    })
    it('flags sk_live_ as not-test', () => {
      expect(__testing.isTestKey('sk_live_abc')).toBe(false)
    })
  })
})

/**
 * Regression — Stripe rejects `lookup_keys=…` and demands the array
 * syntax `lookup_keys[]=…` (HTTP 400 "Invalid array"). syncPricingToStripe
 * was shipped with the bare-key form in Sprint 17.3 and only caught
 * during the live test-mode smoke. This test guards against the
 * regression by asserting every /prices fetch in the sync uses
 * bracket-array syntax.
 */
describe('lookup_keys query encoding (regression)', () => {
  it('uses bracket syntax (lookup_keys[]=…) on every /prices GET', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_regression_xyz'
    const fetchCalls: string[] = []
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const u = String(url)
      fetchCalls.push(u)
      if (u.includes('/products/search')) {
        // Pretend the product already exists so we skip create_product.
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({ data: [{ id: 'prod_existing', name: 'x' }], has_more: false }),
        } as any
      }
      if (u.includes('/prices?')) {
        // Pretend the price already exists at the right amount so the loop ends.
        return {
          ok: true,
          status: 200,
          text: async () => '',
          json: async () => ({
            data: [{ id: 'price_existing', unit_amount: 9900, product: 'prod_existing', active: true, lookup_key: 'x' }],
            has_more: false,
          }),
        } as any
      }
      throw new Error(`Unexpected fetch in test: ${u}`)
    }) as any

    const supabaseStub = { from: () => ({ upsert: async () => ({ data: null, error: null }) }) } as any
    // Inject a unit_amount that matches the stubbed find so it's a reuse.
    // The sync still runs all 6 brackets — only the standard 1-5 reuse path
    // will return; others will mismatch on unit_amount and trip createPrice.
    // To keep this fast we override pricing-config indirectly by snapshotting
    // only the first call's URL shape.
    await syncPricingToStripe(supabaseStub).catch(() => { /* createPrice will be hit; OK */ })

    const priceFetches = fetchCalls.filter((u) => u.includes('/prices?'))
    expect(priceFetches.length).toBeGreaterThan(0)
    for (const u of priceFetches) {
      // The fix: the URL must contain lookup_keys[]= (URL-encoded as %5B%5D=).
      expect(u).toMatch(/lookup_keys(?:%5B%5D|\[\])=/)
      // And must NOT use the bare form that produced "Invalid array".
      expect(u).not.toMatch(/[?&]lookup_keys=/)
    }
  })
})
