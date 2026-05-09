/**
 * Sprint 8.8 — confidence calibrator tests.
 *
 * Pure-function coverage:
 *   1. Identity (no signals → calibrated == raw, clamped)
 *   2. Each rule contributes its expected delta
 *   3. Cumulative effect when multiple rules fire
 *   4. Bounds: never < 0, never > 1
 *   5. confidenceBucket thresholds
 */
import { describe, it, expect } from 'vitest'
import { calibrateConfidence, confidenceBucket } from './confidence'

describe('calibrateConfidence — identity & clamping', () => {
  it('returns raw when no signals are supplied', () => {
    const r = calibrateConfidence(0.5)
    expect(r.raw).toBe(0.5)
    expect(r.calibrated).toBe(0.5)
    expect(r.deltas).toEqual([])
  })

  it('clamps raw < 0 to 0', () => {
    const r = calibrateConfidence(-0.3)
    expect(r.raw).toBe(0)
    expect(r.calibrated).toBe(0)
  })

  it('clamps raw > 1 to 1', () => {
    const r = calibrateConfidence(1.5)
    expect(r.raw).toBe(1)
    expect(r.calibrated).toBe(1)
  })

  it('returns 0 when raw is NaN', () => {
    const r = calibrateConfidence(NaN)
    expect(r.raw).toBe(0)
    expect(r.calibrated).toBe(0)
  })
})

describe('calibrateConfidence — reviewer verdicts', () => {
  it('reviewed_ok adds +0.20', () => {
    const r = calibrateConfidence(0.5, { reviewerVerdict: 'reviewed_ok' })
    expect(r.calibrated).toBeCloseTo(0.7, 5)
    expect(r.deltas[0]).toEqual({ rule: 'verdict:reviewed_ok', delta: 0.20 })
  })

  it('reviewed_problem subtracts 0.30', () => {
    const r = calibrateConfidence(0.5, { reviewerVerdict: 'reviewed_problem' })
    expect(r.calibrated).toBeCloseTo(0.2, 5)
    expect(r.deltas[0]).toEqual({ rule: 'verdict:reviewed_problem', delta: -0.30 })
  })

  it('dismissed subtracts 0.05', () => {
    const r = calibrateConfidence(0.5, { reviewerVerdict: 'dismissed' })
    expect(r.calibrated).toBeCloseTo(0.45, 5)
  })

  it('pending verdict produces no delta', () => {
    const r = calibrateConfidence(0.5, { reviewerVerdict: 'pending' })
    expect(r.calibrated).toBe(0.5)
    expect(r.deltas).toEqual([])
  })

  it('clamps to 1 when verdict pushes past ceiling', () => {
    const r = calibrateConfidence(0.95, { reviewerVerdict: 'reviewed_ok' })
    expect(r.calibrated).toBe(1)
  })

  it('clamps to 0 when verdict pushes below floor', () => {
    const r = calibrateConfidence(0.10, { reviewerVerdict: 'reviewed_problem' })
    expect(r.calibrated).toBe(0)
  })
})

describe('calibrateConfidence — feedback aggregate', () => {
  it('produces no delta when raterCount is 0', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: 5, feedbackRaterCount: 0 })
    expect(r.calibrated).toBe(0.5)
  })

  it('+1 to +2 net rating adds +0.05', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: 1, feedbackRaterCount: 1 })
    expect(r.calibrated).toBeCloseTo(0.55, 5)
  })

  it('> +2 net rating adds +0.10', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: 4, feedbackRaterCount: 5 })
    expect(r.calibrated).toBeCloseTo(0.60, 5)
  })

  it('-1 to -2 net rating subtracts 0.05', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: -2, feedbackRaterCount: 3 })
    expect(r.calibrated).toBeCloseTo(0.45, 5)
  })

  it('< -2 net rating subtracts 0.15', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: -5, feedbackRaterCount: 6 })
    expect(r.calibrated).toBeCloseTo(0.35, 5)
  })

  it('produces no delta when net is 0 (mixed feedback)', () => {
    const r = calibrateConfidence(0.5, { feedbackTotalRating: 0, feedbackRaterCount: 4 })
    expect(r.calibrated).toBe(0.5)
  })
})

describe('calibrateConfidence — fallback cite-back', () => {
  it('adds +0.05 when fallback cited the top page', () => {
    const r = calibrateConfidence(0.5, { fallbackCitedTopPage: true })
    expect(r.calibrated).toBeCloseTo(0.55, 5)
    expect(r.deltas).toEqual([{ rule: 'fallback_cited_top', delta: 0.05 }])
  })

  it('produces no delta when fallback did not cite the top page', () => {
    const r = calibrateConfidence(0.5, { fallbackCitedTopPage: false })
    expect(r.calibrated).toBe(0.5)
  })
})

describe('calibrateConfidence — cumulative', () => {
  it('combines reviewed_ok + strong feedback + cite-back', () => {
    const r = calibrateConfidence(0.4, {
      reviewerVerdict: 'reviewed_ok',
      feedbackTotalRating: 5,
      feedbackRaterCount: 5,
      fallbackCitedTopPage: true,
    })
    // 0.4 + 0.20 + 0.10 + 0.05 = 0.75
    expect(r.calibrated).toBeCloseTo(0.75, 5)
    expect(r.deltas.length).toBe(3)
  })

  it('combines negative signals (reviewed_problem + thumbs-down)', () => {
    const r = calibrateConfidence(0.6, {
      reviewerVerdict: 'reviewed_problem',
      feedbackTotalRating: -3,
      feedbackRaterCount: 4,
    })
    // 0.6 - 0.30 - 0.15 = 0.15
    expect(r.calibrated).toBeCloseTo(0.15, 5)
  })

  it('clamps cumulative result to [0, 1]', () => {
    const high = calibrateConfidence(0.9, {
      reviewerVerdict: 'reviewed_ok',
      feedbackTotalRating: 10,
      feedbackRaterCount: 10,
      fallbackCitedTopPage: true,
    })
    expect(high.calibrated).toBe(1)

    const low = calibrateConfidence(0.1, {
      reviewerVerdict: 'reviewed_problem',
      feedbackTotalRating: -10,
      feedbackRaterCount: 10,
    })
    expect(low.calibrated).toBe(0)
  })
})

describe('confidenceBucket', () => {
  it.each([
    [1.0, 'high'],
    [0.9, 'high'],
    [0.7, 'high'],
    [0.69, 'medium'],
    [0.5, 'medium'],
    [0.4, 'medium'],
    [0.39, 'low'],
    [0.0, 'low'],
  ] as const)('%f → %s', (score, expected) => {
    expect(confidenceBucket(score)).toBe(expected)
  })
})
