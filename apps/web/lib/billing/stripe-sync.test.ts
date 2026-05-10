/**
 * Phase 17 Sprint 17.3 — stripe-sync helper tests.
 *
 * The full sync requires Stripe API access; these tests cover the pure
 * helpers (lookup_key + product name shape) and the secret-key gate.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { __testing } from './stripe-sync'

const ORIG_KEY = process.env.STRIPE_SECRET_KEY
afterEach(() => { process.env.STRIPE_SECRET_KEY = ORIG_KEY })

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
