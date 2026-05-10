/**
 * Phase 17 Sprint 17.5 — checkout-tier helper tests.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { __testing } from './route'

const ORIG_KEY = process.env.STRIPE_SECRET_KEY
afterEach(() => { process.env.STRIPE_SECRET_KEY = ORIG_KEY })

describe('checkout-tier helpers', () => {
  describe('bracketMinFor', () => {
    it('rounds 1-5 to 1', () => {
      expect(__testing.bracketMinFor(1)).toBe(1)
      expect(__testing.bracketMinFor(5)).toBe(1)
    })
    it('rounds 6-15 to 6', () => {
      expect(__testing.bracketMinFor(6)).toBe(6)
      expect(__testing.bracketMinFor(15)).toBe(6)
    })
    it('rounds 16+ to 16', () => {
      expect(__testing.bracketMinFor(16)).toBe(16)
      expect(__testing.bracketMinFor(100)).toBe(16)
    })
  })

  describe('readSecret', () => {
    it('returns null without STRIPE_SECRET_KEY', () => {
      delete process.env.STRIPE_SECRET_KEY
      expect(__testing.readSecret()).toBeNull()
    })
    it('returns null for sk_placeholder', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_placeholder_phase14'
      expect(__testing.readSecret()).toBeNull()
    })
    it('returns sk_test_ keys', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_real'
      expect(__testing.readSecret()).toBe('sk_test_real')
    })
  })
})
