import { describe, expect, it } from 'vitest'
import { estimateCostCents } from './pricing'

describe('estimateCostCents', () => {
  it('computes integer cents for a known model (gpt-4o: $5/$15 per 1M)', () => {
    // 1000 in + 1000 out → (1000*5 + 1000*15)/1e6 = $0.02 → 2 cents
    expect(estimateCostCents('gpt-4o', 1000, 1000)).toBe(2)
  })

  it('handles input-only embedding pricing', () => {
    // text-embedding-3-large: $0.13/1M input, $0 output.
    // 1,000,000 in → $0.13 → 13 cents
    expect(estimateCostCents('text-embedding-3-large', 1_000_000, 0)).toBe(13)
  })

  it('returns null for an unknown model (cost unknown, not zero)', () => {
    expect(estimateCostCents('some-future-model', 1000, 1000)).toBeNull()
  })
})
