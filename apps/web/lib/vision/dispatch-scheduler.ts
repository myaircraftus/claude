/**
 * Phase 14 Sprint 14.3 — tier-aware dispatch scheduling.
 *
 * Pure helper that translates (effective tier, page count) → scheduled_for
 * timestamp for a fresh vision_index_job. Used by the auto-dispatch
 * helper at upload time so the queue worker sees the right ready-time.
 *
 * Routing matrix:
 *   beta              + small doc → scheduled_for = NOW()
 *   pro               + small doc → scheduled_for = NOW()
 *   standard          + small doc → scheduled_for = next 02:00 UTC
 *   any tier          + >200 pages → scheduled_for = next 02:00 UTC (large doc)
 *
 * The large-doc rule trumps the tier rule (per pricing-config.ts).
 */
import {
  effectiveProcessingMode,
  PROCESSING_RULES,
  type TierSlug,
} from '@/lib/billing/pricing-config'

/**
 * Compute the scheduled_for timestamp for a new vision_index_job.
 *
 * @param tier        Effective tier for this aircraft (post-killswitch + override)
 * @param pageCount   Document page count (used to apply the large-doc rule)
 * @param now         Override "now" for testability (default: real now)
 * @returns           ISO timestamp string suitable for scheduled_for
 */
export function computeScheduledFor(
  tier: TierSlug,
  pageCount: number,
  now: Date = new Date(),
): string {
  const mode = effectiveProcessingMode(tier, pageCount)
  if (mode === 'realtime') {
    return now.toISOString()
  }
  // batch — next 02:00 UTC after `now`
  const batch = new Date(now)
  batch.setUTCHours(2, 0, 0, 0)
  if (batch.getTime() <= now.getTime()) {
    batch.setUTCDate(batch.getUTCDate() + 1)
  }
  return batch.toISOString()
}

/**
 * Returns true if a job with this scheduled_for is ready to be claimed.
 * Mirrors the SQL filter `scheduled_for <= NOW()`.
 */
export function isReadyToClaim(scheduledFor: string, now: Date = new Date()): boolean {
  return new Date(scheduledFor).getTime() <= now.getTime()
}

/**
 * Human-readable explanation of why a doc was scheduled the way it was.
 * Used by the upload UI to show "Expected ready: tomorrow 06:00 (Standard
 * tier)" or "Expected ready: in ~15 min (Pro tier)" or "Expected ready:
 * tomorrow 02:00 UTC (large doc — over 200 pages)".
 */
export function explainScheduling(
  tier: TierSlug,
  pageCount: number,
): { mode: 'batch' | 'realtime'; reason: 'tier' | 'large-doc' } {
  const mode = effectiveProcessingMode(tier, pageCount)
  const reason: 'tier' | 'large-doc' =
    pageCount > PROCESSING_RULES.largeDocPageThreshold ? 'large-doc' : 'tier'
  return { mode, reason }
}
