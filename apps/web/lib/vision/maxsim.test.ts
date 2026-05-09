/**
 * Sprint 8.5 — MaxSim late-interaction tests.
 *
 * Pure math, fully deterministic. No mocks needed.
 */
import { describe, it, expect } from 'vitest'
import { cosine, maxSim, normalizedMaxSim } from './maxsim'

describe('cosine', () => {
  it('identical unit vectors → 1.0', () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0, 10)
  })

  it('orthogonal vectors → 0', () => {
    expect(cosine([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 10)
  })

  it('opposite vectors → -1', () => {
    expect(cosine([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 10)
  })

  it('zero-vector → 0 (no NaN)', () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0)
    expect(cosine([1, 2, 3], [0, 0, 0])).toBe(0)
    expect(cosine([0, 0, 0], [0, 0, 0])).toBe(0)
  })

  it('throws on dim mismatch', () => {
    expect(() => cosine([1, 2], [1, 2, 3])).toThrow(/dim mismatch/)
  })

  it('symmetric: cos(a,b) === cos(b,a)', () => {
    const a = [0.5, 0.7, -0.2]
    const b = [-0.3, 0.4, 0.9]
    expect(cosine(a, b)).toBeCloseTo(cosine(b, a), 10)
  })

  it('scale-invariant: doubling either vector preserves cosine', () => {
    const a = [1, 2, 3]
    const b = [4, 5, 6]
    const a2 = a.map((x) => x * 2)
    const b3 = b.map((x) => x * 3)
    expect(cosine(a, b)).toBeCloseTo(cosine(a2, b3), 10)
  })
})

describe('maxSim', () => {
  it('empty query → 0', () => {
    expect(maxSim([], [[1, 0, 0]])).toBe(0)
  })

  it('empty patch matrix → 0', () => {
    expect(maxSim([[1, 0, 0]], [])).toBe(0)
  })

  it('one query token, one patch identical → 1', () => {
    expect(maxSim([[1, 0, 0]], [[1, 0, 0]])).toBeCloseTo(1, 10)
  })

  it('one query token, multiple patches → max cosine', () => {
    const score = maxSim(
      [[1, 0, 0]],
      [[0, 1, 0], [0.7, 0.7, 0], [1, 0, 0]],
    )
    expect(score).toBeCloseTo(1, 10)
  })

  it('multiple query tokens → SUM of per-token max', () => {
    // q1 best matches p1 (cos=1), q2 best matches p2 (cos=1)
    const score = maxSim(
      [[1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 1, 0]],
    )
    expect(score).toBeCloseTo(2, 10)
  })

  it('orthogonal everything → 0', () => {
    expect(maxSim(
      [[1, 0, 0], [0, 1, 0]],
      [[0, 0, 1], [0, 0, 1]],
    )).toBeCloseTo(0, 10)
  })

  it('zero-vector token contributes 0, not NaN', () => {
    const score = maxSim(
      [[0, 0, 0], [1, 0, 0]],
      [[1, 0, 0]],
    )
    expect(score).toBeCloseTo(1, 10)
    expect(Number.isFinite(score)).toBe(true)
  })

  it('throws on within-side dim mismatch', () => {
    expect(() => maxSim(
      [[1, 0, 0]],
      [[1, 0]],
    )).toThrow(/dim mismatch/)
  })
})

describe('normalizedMaxSim', () => {
  it('divides by query token count', () => {
    const score = normalizedMaxSim(
      [[1, 0, 0], [0, 1, 0]],
      [[1, 0, 0], [0, 1, 0]],
    )
    expect(score).toBeCloseTo(1, 10) // (1 + 1) / 2
  })

  it('empty query → 0 (no division by zero)', () => {
    expect(normalizedMaxSim([], [[1, 0, 0]])).toBe(0)
  })

  it('respects bounds for orthogonal: → 0', () => {
    expect(normalizedMaxSim(
      [[1, 0, 0]],
      [[0, 1, 0]],
    )).toBeCloseTo(0, 10)
  })

  it('partial match: ratio of matched-query-tokens', () => {
    // 4 query tokens; 2 perfectly match, 2 are orthogonal
    const score = normalizedMaxSim(
      [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]],
      [[1, 0, 0], [0, 1, 0]],   // patches: only x and y axes
    )
    // Token 1: cos(x, x)=1; Token 2: cos(y, y)=1; Token 3: cos(z, anything in xy)=0; Token 4: cos(x, x)=1
    // Sum = 3, normalized = 3/4 = 0.75
    expect(score).toBeCloseTo(0.75, 10)
  })
})
