/**
 * Phase 14 — pricing tier source of truth (LOCKED 2026-05-09).
 *
 * Single TypeScript file owns the entire per-aircraft pricing model.
 * Marketing pages, code routing logic, terms, DB defaults — all read
 * from here. NEVER hardcode prices anywhere else in the codebase.
 *
 * Coexists with `lib/billing/products.ts` (per-persona Stripe SKUs from
 * Phase 6) — that's a separate per-user/per-persona track. This module
 * is the per-aircraft tier track from Phase 14.
 *
 * Locked decisions (do not modify without Andy's explicit approval —
 * see /docs/new implementation/context.md Section 12):
 *   - Three tiers: Beta (free, current state) / Standard / Pro
 *   - Standard: batch processing, 24-hour SLA
 *   - Pro: real-time processing, 5-15 minute SLA
 *   - Volume discounts at 6 and 16 aircraft thresholds
 *   - Pro = Standard + $50 (per-aircraft, all volume tiers)
 *   - Human review designed but NOT billed in v1
 *     (HUMAN_REVIEW_BILLING_ENABLED=false until v2)
 */

// ─── Tier slugs ────────────────────────────────────────────────────────

export const TIER_SLUGS = ['beta', 'standard', 'pro'] as const
export type TierSlug = (typeof TIER_SLUGS)[number]

export function isTierSlug(value: unknown): value is TierSlug {
  return typeof value === 'string' && (TIER_SLUGS as readonly string[]).includes(value)
}

// ─── Volume pricing brackets ───────────────────────────────────────────

export interface PriceBracket {
  /** Lower bound of aircraft count (inclusive). */
  minAircraft: number
  /** Upper bound (inclusive); null means unbounded. */
  maxAircraft: number | null
  /** Per-aircraft monthly price in USD (whole dollars). */
  pricePerAircraft: number
}

// ─── Tier definitions ──────────────────────────────────────────────────

export interface TierDefinition {
  slug: TierSlug
  name: string
  /** SLA shorthand; affects routing but not displayed copy. */
  sla: 'real-time' | 'batch-24h'
  /** Whether this tier ever gets billed. Beta is forever free. */
  billable: boolean
  /** Customer-facing SLA copy — used verbatim by the marketing pages. */
  slaCopy: string
  /** Routing mode: drives auto-dispatch scheduled_for. */
  processingMode: 'batch' | 'realtime'
  /** Volume brackets — beta has none. */
  priceTiers?: PriceBracket[]
  /** Flat monthly price in USD if no volume tiers (beta only). */
  priceMonthly?: number
}

export const TIER_DEFINITIONS: Record<TierSlug, TierDefinition> = {
  beta: {
    slug: 'beta',
    name: 'Beta',
    sla: 'real-time',
    billable: false,
    priceMonthly: 0,
    slaCopy: 'Documents are processed in real-time during beta.',
    processingMode: 'realtime',
  },
  standard: {
    slug: 'standard',
    name: 'Standard',
    sla: 'batch-24h',
    billable: true,
    priceTiers: [
      { minAircraft: 1, maxAircraft: 5, pricePerAircraft: 99 },
      { minAircraft: 6, maxAircraft: 15, pricePerAircraft: 79 },
      { minAircraft: 16, maxAircraft: null, pricePerAircraft: 59 },
    ],
    slaCopy: 'Your documents will be searchable within 24 hours of upload.',
    processingMode: 'batch',
  },
  pro: {
    slug: 'pro',
    name: 'Pro',
    sla: 'real-time',
    billable: true,
    priceTiers: [
      { minAircraft: 1, maxAircraft: 5, pricePerAircraft: 149 },
      { minAircraft: 6, maxAircraft: 15, pricePerAircraft: 129 },
      { minAircraft: 16, maxAircraft: null, pricePerAircraft: 109 },
    ],
    slaCopy: 'Your documents will be searchable in 5-15 minutes after upload.',
    processingMode: 'realtime',
  },
}

// ─── Human review (designed, not billed in v1) ─────────────────────────

export interface HumanReviewRate {
  key: 'standardQa' | 'expertAp'
  name: string
  hourlyRate: number
  description: string
}

export const HUMAN_REVIEW_RATES: Record<HumanReviewRate['key'], HumanReviewRate> = {
  standardQa: {
    key: 'standardQa',
    name: 'Standard QA Review',
    hourlyRate: 50,
    description: 'General accuracy and typo correction.',
  },
  expertAp: {
    key: 'expertAp',
    name: 'Expert A&P Verification',
    hourlyRate: 150,
    description: 'A&P/IA reviews handwritten content for regulatory compliance.',
  },
}

/**
 * Master kill-switch for human review billing. Set via env var
 * `HUMAN_REVIEW_BILLING_ENABLED`. Default false until v2 launches.
 * Controls whether choosing a review type creates a charge or just a
 * tracked workflow row.
 */
export function humanReviewBillingEnabled(): boolean {
  return process.env.HUMAN_REVIEW_BILLING_ENABLED === 'true'
}

// ─── Processing rules ──────────────────────────────────────────────────

export const PROCESSING_RULES = {
  /** Documents over this size always go to batch regardless of tier. */
  largeDocPageThreshold: 200,
  /** Handwriting share above this fraction triggers the review banner. */
  handwritingThreshold: 0.3,
  /** Vercel cron schedule (UTC) for the batch trigger. */
  batchCronTime: '0 2 * * *',
  /** SLA targets in their natural units. */
  proSlaMinutes: 15,
  standardSlaHours: 24,
  /** Heuristic: how many handwritten pages an A&P can review per hour. */
  handwrittenPagesPerHour: 30,
} as const

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Calculate the customer's monthly bill for the given tier + fleet size.
 * Beta returns 0. Volume brackets are inclusive on both ends.
 *
 * NB: this is a "flat" price-per-aircraft calculation, not a tiered
 * marginal one. 6 aircraft on Standard pays 6 × $79 (the new bracket
 * applies to all aircraft, not just the marginal ones). This matches
 * the marketing copy's volume table.
 */
export function calculateMonthlyPrice(tier: TierSlug, aircraftCount: number): number {
  const def = TIER_DEFINITIONS[tier]
  if (!def.billable) return 0
  if (def.priceMonthly !== undefined && !def.priceTiers) {
    return def.priceMonthly * Math.max(0, aircraftCount)
  }
  if (!def.priceTiers || aircraftCount <= 0) return 0
  for (const bracket of def.priceTiers) {
    const inLower = aircraftCount >= bracket.minAircraft
    const inUpper = bracket.maxAircraft === null || aircraftCount <= bracket.maxAircraft
    if (inLower && inUpper) {
      return bracket.pricePerAircraft * aircraftCount
    }
  }
  // Defensive — should be unreachable if brackets cover [1, ∞).
  return 0
}

/** Per-aircraft price at this fleet size. Useful for the marketing page. */
export function pricePerAircraftAtFleetSize(tier: TierSlug, aircraftCount: number): number {
  const def = TIER_DEFINITIONS[tier]
  if (!def.billable) return 0
  if (def.priceMonthly !== undefined && !def.priceTiers) return def.priceMonthly
  if (!def.priceTiers || aircraftCount <= 0) return 0
  for (const bracket of def.priceTiers) {
    const inLower = aircraftCount >= bracket.minAircraft
    const inUpper = bracket.maxAircraft === null || aircraftCount <= bracket.maxAircraft
    if (inLower && inUpper) return bracket.pricePerAircraft
  }
  return 0
}

/**
 * Returns the dispatch routing mode for a tier. Beta is treated like Pro
 * (real-time) — current users keep working as-is.
 */
export function getProcessingMode(tier: TierSlug): 'batch' | 'realtime' {
  return TIER_DEFINITIONS[tier].processingMode
}

/**
 * Resolve the effective tier for an organization. Honors a per-org
 * override + a global "tier_billing_disabled" flag (which keeps the org
 * on free/beta even if their nominal tier is Standard or Pro).
 *
 * The DB authoritative read lives in `lib/billing/tier-service.ts`; this
 * helper is a pure function for the in-memory resolution rule.
 */
export function getEffectiveTier(input: {
  /** Org's nominal tier. */
  orgTier: TierSlug
  /** When true, treat the org as Beta (free/Pro-equivalent processing) regardless. */
  tierBillingDisabled: boolean
}): TierSlug {
  if (input.tierBillingDisabled) return 'beta'
  return input.orgTier
}

/** SLA copy for the given tier — used by upload modals + marketing. */
export function getSlaCopy(tier: TierSlug): string {
  return TIER_DEFINITIONS[tier].slaCopy
}

/**
 * Estimate review cost. `reviewType` matches HUMAN_REVIEW_RATES keys.
 * In v1 this drives ONLY the customer-facing estimate banner; no actual
 * charge happens until humanReviewBillingEnabled() returns true.
 */
export function estimateReviewCost(
  reviewType: HumanReviewRate['key'],
  estimatedHours: number,
): { hours: number; rate: number; total: number } {
  const rate = HUMAN_REVIEW_RATES[reviewType].hourlyRate
  const hours = Math.max(0, Math.ceil(estimatedHours))
  return { hours, rate, total: hours * rate }
}

/**
 * Heuristic: how many hours of A&P review a handwritten doc would take.
 * Used by the upload UI when handwriting_pct exceeds threshold.
 */
export function estimateReviewHoursFromPages(pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.ceil(pageCount / PROCESSING_RULES.handwrittenPagesPerHour)
}

/**
 * Should this document bypass the tier's normal routing because of size?
 * The "soft cap on Pro" rule: any doc > 200 pages goes to batch
 * regardless of tier. Returns the effective processing mode after
 * applying both tier + size rules.
 */
export function effectiveProcessingMode(
  tier: TierSlug,
  pageCount: number,
): 'batch' | 'realtime' {
  if (pageCount > PROCESSING_RULES.largeDocPageThreshold) return 'batch'
  return getProcessingMode(tier)
}

/**
 * Compute when a doc dispatched right now would be ready, given its
 * effective processing mode. Used by the upload UI's "Expected ready"
 * line. Returns a Date.
 */
export function estimatedReadyAt(
  mode: 'batch' | 'realtime',
  uploadedAt: Date = new Date(),
): Date {
  if (mode === 'realtime') {
    const ready = new Date(uploadedAt)
    ready.setMinutes(ready.getMinutes() + PROCESSING_RULES.proSlaMinutes)
    return ready
  }
  // batch — next 02:00 UTC after upload
  const ready = new Date(uploadedAt)
  ready.setUTCHours(2, 0, 0, 0)
  if (ready.getTime() <= uploadedAt.getTime()) {
    ready.setUTCDate(ready.getUTCDate() + 1)
  }
  return ready
}
