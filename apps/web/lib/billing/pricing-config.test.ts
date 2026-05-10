/**
 * Phase 14 Sprint 14.1 — pricing config tests.
 *
 * Locks the volume math + helper behavior. If any test here fails,
 * either the pricing was changed (need Andy's approval — see context.md
 * Section 12) or a helper regressed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  TIER_DEFINITIONS,
  TIER_SLUGS,
  HUMAN_REVIEW_RATES,
  PROCESSING_RULES,
  calculateMonthlyPrice,
  pricePerAircraftAtFleetSize,
  getProcessingMode,
  getEffectiveTier,
  getSlaCopy,
  estimateReviewCost,
  estimateReviewHoursFromPages,
  effectiveProcessingMode,
  estimatedReadyAt,
  humanReviewBillingEnabled,
  isTierSlug,
} from './pricing-config'

describe('pricing-config: locked tier definitions', () => {
  it('exposes exactly three tier slugs', () => {
    expect(TIER_SLUGS).toEqual(['beta', 'standard', 'pro'])
  })

  it('beta is free and not billable', () => {
    expect(TIER_DEFINITIONS.beta.billable).toBe(false)
    expect(TIER_DEFINITIONS.beta.priceMonthly).toBe(0)
  })

  it('standard has volume tiers $99/$79/$59', () => {
    const tiers = TIER_DEFINITIONS.standard.priceTiers!
    expect(tiers).toHaveLength(3)
    expect(tiers[0]).toEqual({ minAircraft: 1, maxAircraft: 5, pricePerAircraft: 99 })
    expect(tiers[1]).toEqual({ minAircraft: 6, maxAircraft: 15, pricePerAircraft: 79 })
    expect(tiers[2]).toEqual({ minAircraft: 16, maxAircraft: null, pricePerAircraft: 59 })
  })

  it('pro = standard + $50 across all volume tiers', () => {
    const std = TIER_DEFINITIONS.standard.priceTiers!
    const pro = TIER_DEFINITIONS.pro.priceTiers!
    for (let i = 0; i < std.length; i++) {
      expect(pro[i].pricePerAircraft - std[i].pricePerAircraft).toBe(50)
      expect(pro[i].minAircraft).toBe(std[i].minAircraft)
      expect(pro[i].maxAircraft).toBe(std[i].maxAircraft)
    }
  })

  it('beta + pro both route real-time; standard routes batch', () => {
    expect(TIER_DEFINITIONS.beta.processingMode).toBe('realtime')
    expect(TIER_DEFINITIONS.pro.processingMode).toBe('realtime')
    expect(TIER_DEFINITIONS.standard.processingMode).toBe('batch')
  })
})

describe('calculateMonthlyPrice — locked volume math', () => {
  it('Beta is always $0', () => {
    expect(calculateMonthlyPrice('beta', 0)).toBe(0)
    expect(calculateMonthlyPrice('beta', 5)).toBe(0)
    expect(calculateMonthlyPrice('beta', 100)).toBe(0)
  })

  it('Standard volume math (verbatim from brief)', () => {
    expect(calculateMonthlyPrice('standard', 5)).toBe(495)   //  5 × $99
    expect(calculateMonthlyPrice('standard', 10)).toBe(790)  // 10 × $79
    expect(calculateMonthlyPrice('standard', 20)).toBe(1180) // 20 × $59
  })

  it('Pro volume math (verbatim from brief)', () => {
    expect(calculateMonthlyPrice('pro', 5)).toBe(745)   //  5 × $149
    expect(calculateMonthlyPrice('pro', 10)).toBe(1290) // 10 × $129
    expect(calculateMonthlyPrice('pro', 20)).toBe(2180) // 20 × $109
  })

  it('Bracket boundaries: 1, 5, 6, 15, 16 aircraft', () => {
    expect(calculateMonthlyPrice('standard', 1)).toBe(99)
    expect(calculateMonthlyPrice('standard', 5)).toBe(495)
    expect(calculateMonthlyPrice('standard', 6)).toBe(474) //  6 × $79
    expect(calculateMonthlyPrice('standard', 15)).toBe(1185) // 15 × $79
    expect(calculateMonthlyPrice('standard', 16)).toBe(944) // 16 × $59
  })

  it('Zero or negative aircraft → 0', () => {
    expect(calculateMonthlyPrice('standard', 0)).toBe(0)
    expect(calculateMonthlyPrice('standard', -3)).toBe(0)
  })
})

describe('pricePerAircraftAtFleetSize', () => {
  it('returns the bracket rate not the totaled price', () => {
    expect(pricePerAircraftAtFleetSize('standard', 5)).toBe(99)
    expect(pricePerAircraftAtFleetSize('standard', 6)).toBe(79)
    expect(pricePerAircraftAtFleetSize('pro', 16)).toBe(109)
  })
  it('Beta returns 0', () => {
    expect(pricePerAircraftAtFleetSize('beta', 1)).toBe(0)
  })
})

describe('getProcessingMode', () => {
  it('beta + pro → realtime; standard → batch', () => {
    expect(getProcessingMode('beta')).toBe('realtime')
    expect(getProcessingMode('pro')).toBe('realtime')
    expect(getProcessingMode('standard')).toBe('batch')
  })
})

describe('getEffectiveTier', () => {
  it('returns the org tier when billing not disabled', () => {
    expect(getEffectiveTier({ orgTier: 'pro', tierBillingDisabled: false })).toBe('pro')
    expect(getEffectiveTier({ orgTier: 'standard', tierBillingDisabled: false })).toBe('standard')
  })
  it('respects tier_billing_disabled — falls to beta', () => {
    expect(getEffectiveTier({ orgTier: 'pro', tierBillingDisabled: true })).toBe('beta')
    expect(getEffectiveTier({ orgTier: 'standard', tierBillingDisabled: true })).toBe('beta')
  })
})

describe('getSlaCopy', () => {
  it('returns the right copy per tier', () => {
    expect(getSlaCopy('beta')).toMatch(/real-time during beta/i)
    expect(getSlaCopy('standard')).toMatch(/within 24 hours/i)
    expect(getSlaCopy('pro')).toMatch(/5-15 minutes/i)
  })
})

describe('estimateReviewCost', () => {
  it('Standard QA: 4 hours → 4 × $50 = $200', () => {
    const r = estimateReviewCost('standardQa', 4)
    expect(r).toEqual({ hours: 4, rate: 50, total: 200 })
  })
  it('Expert A&P: 6 hours → 6 × $150 = $900', () => {
    const r = estimateReviewCost('expertAp', 6)
    expect(r).toEqual({ hours: 6, rate: 150, total: 900 })
  })
  it('rounds up partial hours (Math.ceil)', () => {
    const r = estimateReviewCost('expertAp', 2.1)
    expect(r.hours).toBe(3)
    expect(r.total).toBe(450)
  })
  it('zero or negative → 0 hours, $0', () => {
    expect(estimateReviewCost('expertAp', 0)).toEqual({ hours: 0, rate: 150, total: 0 })
    expect(estimateReviewCost('standardQa', -1)).toEqual({ hours: 0, rate: 50, total: 0 })
  })
})

describe('estimateReviewHoursFromPages', () => {
  it('30 pages = 1 hour (handwrittenPagesPerHour)', () => {
    expect(estimateReviewHoursFromPages(30)).toBe(1)
  })
  it('rounds up partial: 31 pages = 2 hours', () => {
    expect(estimateReviewHoursFromPages(31)).toBe(2)
  })
  it('zero pages = 0 hours', () => {
    expect(estimateReviewHoursFromPages(0)).toBe(0)
  })
  it('100 pages = ceil(100/30) = 4 hours', () => {
    expect(estimateReviewHoursFromPages(100)).toBe(4)
  })
})

describe('effectiveProcessingMode — large doc rule trumps tier', () => {
  it('Pro + small doc → realtime', () => {
    expect(effectiveProcessingMode('pro', 50)).toBe('realtime')
  })
  it('Pro + large doc (>200 pages) → batch (large doc rule)', () => {
    expect(effectiveProcessingMode('pro', 250)).toBe('batch')
  })
  it('Standard + small doc → batch', () => {
    expect(effectiveProcessingMode('standard', 5)).toBe('batch')
  })
  it('Beta + large doc → batch (large doc rule trumps tier)', () => {
    expect(effectiveProcessingMode('beta', 500)).toBe('batch')
  })
  it('exactly 200 pages → realtime/tier-default (boundary)', () => {
    expect(effectiveProcessingMode('pro', 200)).toBe('realtime')
    expect(effectiveProcessingMode('standard', 200)).toBe('batch')
  })
})

describe('estimatedReadyAt', () => {
  it('realtime mode: ~15 min after upload', () => {
    const at = new Date('2026-05-09T16:00:00Z')
    const ready = estimatedReadyAt('realtime', at)
    expect(ready.getTime() - at.getTime()).toBe(15 * 60_000)
  })

  it('batch mode at 03:00Z: ready next 02:00Z (next day)', () => {
    const at = new Date('2026-05-09T03:00:00Z')
    const ready = estimatedReadyAt('batch', at)
    expect(ready.toISOString()).toBe('2026-05-10T02:00:00.000Z')
  })

  it('batch mode at 01:00Z: ready same day at 02:00Z', () => {
    const at = new Date('2026-05-09T01:00:00Z')
    const ready = estimatedReadyAt('batch', at)
    expect(ready.toISOString()).toBe('2026-05-09T02:00:00.000Z')
  })

  it('batch mode AT 02:00Z: still rolls forward (boundary — equal counts as past)', () => {
    const at = new Date('2026-05-09T02:00:00Z')
    const ready = estimatedReadyAt('batch', at)
    expect(ready.toISOString()).toBe('2026-05-10T02:00:00.000Z')
  })
})

describe('humanReviewBillingEnabled — env-driven kill switch', () => {
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env.HUMAN_REVIEW_BILLING_ENABLED
    delete process.env.HUMAN_REVIEW_BILLING_ENABLED
  })
  afterEach(() => {
    if (prev !== undefined) process.env.HUMAN_REVIEW_BILLING_ENABLED = prev
    else delete process.env.HUMAN_REVIEW_BILLING_ENABLED
  })

  it('default false (v1 launch state)', () => {
    expect(humanReviewBillingEnabled()).toBe(false)
  })
  it('true only when env is exactly "true"', () => {
    process.env.HUMAN_REVIEW_BILLING_ENABLED = 'true'
    expect(humanReviewBillingEnabled()).toBe(true)
    process.env.HUMAN_REVIEW_BILLING_ENABLED = '1'
    expect(humanReviewBillingEnabled()).toBe(false)
    process.env.HUMAN_REVIEW_BILLING_ENABLED = 'TRUE'
    expect(humanReviewBillingEnabled()).toBe(false)
  })
})

describe('isTierSlug guard', () => {
  it('accepts the three valid slugs', () => {
    expect(isTierSlug('beta')).toBe(true)
    expect(isTierSlug('standard')).toBe(true)
    expect(isTierSlug('pro')).toBe(true)
  })
  it('rejects garbage', () => {
    expect(isTierSlug('enterprise')).toBe(false)
    expect(isTierSlug('')).toBe(false)
    expect(isTierSlug(null)).toBe(false)
    expect(isTierSlug(99)).toBe(false)
  })
})

describe('HUMAN_REVIEW_RATES + PROCESSING_RULES — locked', () => {
  it('Standard QA = $50/hr', () => {
    expect(HUMAN_REVIEW_RATES.standardQa.hourlyRate).toBe(50)
  })
  it('Expert A&P = $150/hr', () => {
    expect(HUMAN_REVIEW_RATES.expertAp.hourlyRate).toBe(150)
  })
  it('large doc threshold = 200', () => {
    expect(PROCESSING_RULES.largeDocPageThreshold).toBe(200)
  })
  it('handwriting threshold = 30%', () => {
    expect(PROCESSING_RULES.handwritingThreshold).toBe(0.3)
  })
  it('batch cron = 02:00 UTC daily', () => {
    expect(PROCESSING_RULES.batchCronTime).toBe('0 2 * * *')
  })
})
