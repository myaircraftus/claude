/**
 * Phase 8 Vision RAG — confidence calibrator (Sprint 8.8).
 *
 * Pure function. Inputs:
 *   - rawScore: top combined retrieval score (0-1) from hybridRetrieve
 *   - signals: optional feedback / review-verdict signals from
 *     past requests against the SAME (query, page) pair
 *
 * Output: calibrated confidence in [0, 1].
 *
 * Calibration rules (cumulative, all clamped to [0, 1]):
 *   1. Start at rawScore.
 *   2. If a reviewer marked the (query × page) as `reviewed_ok`, give
 *      a +0.20 boost (capped). Strong human signal — a domain expert
 *      already validated the page is relevant.
 *   3. If a reviewer marked it `reviewed_problem`, apply −0.30 penalty.
 *   4. Net feedback (sum of thumbs):
 *        > +2 ⇒ +0.10, +1..+2 ⇒ +0.05
 *        < −2 ⇒ −0.15, −1..−2 ⇒ −0.05
 *   5. Cite-back signal: when the fallback fired AND returned at least
 *      one citation that matches the top retrieval page, add +0.05.
 *      (Cross-validates retrieval against the LLM's own grounding.)
 *
 * The function intentionally takes raw inputs (no Supabase client) so
 * it can be unit-tested without mocks. Callers fetch the signals
 * elsewhere (lib/vision/telemetry.ts) and pass them in.
 */
export interface CalibrationSignals {
  /** Latest reviewer verdict on this (query × page), if any. */
  reviewerVerdict?: 'reviewed_ok' | 'reviewed_problem' | 'dismissed' | 'pending'
  /** Sum of thumbs across all users for (query × page). */
  feedbackTotalRating?: number
  /** Number of distinct raters (used for confidence-on-the-feedback). */
  feedbackRaterCount?: number
  /** True iff fallback fired and cited the top retrieval page. */
  fallbackCitedTopPage?: boolean
}

export interface CalibrationResult {
  raw: number
  calibrated: number
  /** Per-rule deltas, useful for telemetry / debugging. */
  deltas: Array<{ rule: string; delta: number }>
}

const VERDICT_DELTA: Record<NonNullable<CalibrationSignals['reviewerVerdict']>, number> = {
  reviewed_ok: 0.20,
  reviewed_problem: -0.30,
  dismissed: -0.05, // mild — admin chose not to action, suggests low signal
  pending: 0,
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

/** Map a feedback total to a delta. */
function feedbackDelta(total: number, raters: number): number {
  // Require at least one rater for any signal.
  if (raters <= 0) return 0
  if (total > 2) return 0.10
  if (total >= 1) return 0.05
  if (total < -2) return -0.15
  if (total <= -1) return -0.05
  return 0
}

export function calibrateConfidence(
  rawScore: number,
  signals: CalibrationSignals = {},
): CalibrationResult {
  const raw = clamp01(rawScore)
  const deltas: Array<{ rule: string; delta: number }> = []

  // Reviewer verdict.
  if (signals.reviewerVerdict) {
    const d = VERDICT_DELTA[signals.reviewerVerdict] ?? 0
    if (d !== 0) deltas.push({ rule: `verdict:${signals.reviewerVerdict}`, delta: d })
  }

  // Feedback aggregate.
  const fbTotal = signals.feedbackTotalRating ?? 0
  const fbRaters = signals.feedbackRaterCount ?? 0
  const fbD = feedbackDelta(fbTotal, fbRaters)
  if (fbD !== 0) deltas.push({ rule: `feedback:${fbTotal}/${fbRaters}`, delta: fbD })

  // Fallback cite-back.
  if (signals.fallbackCitedTopPage) {
    deltas.push({ rule: 'fallback_cited_top', delta: 0.05 })
  }

  const total = deltas.reduce((s, d) => s + d.delta, 0)
  const calibrated = clamp01(raw + total)

  return { raw, calibrated, deltas }
}

/**
 * Bucket a calibrated score into HIGH / MEDIUM / LOW for UI display.
 * Thresholds match the existing /lib/rag confidence bucketing to keep
 * the user-facing badge consistent across text-RAG and vision-RAG.
 */
export function confidenceBucket(calibrated: number): 'high' | 'medium' | 'low' {
  if (calibrated >= 0.7) return 'high'
  if (calibrated >= 0.4) return 'medium'
  return 'low'
}
