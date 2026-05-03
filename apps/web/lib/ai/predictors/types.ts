/**
 * Shared types for the heuristic predictor suite (Spec 5.3).
 *
 * Each predictor returns a `PredictionResult` with a confidence score, a
 * priority recommendation, and optional `evidence` strings the AI Inbox
 * card surfaces verbatim. Predictors NEVER write to the DB — orchestration
 * lives in /api/cron/maintenance-predictions.
 *
 * `kind` is namespaced (`compression-trend`, `oil-consumption`,
 * `component-failure`) so dedupe_key on ai_action_cards can be derived
 * deterministically.
 */

export type PredictionKind = 'compression-trend' | 'oil-consumption' | 'component-failure'

export type PredictionPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface PredictionResult {
  kind: PredictionKind
  /** Pre-LLM rule-based summary; LLM may rewrite for the user-facing card body. */
  headline: string
  /** Human-readable evidence — bullets the card renders under the body. */
  evidence: string[]
  /** Risk priority for the AI Inbox card. */
  priority: PredictionPriority
  /** Confidence in the prediction (0-1). Below 0.4 → don't surface. */
  confidence: number
  /** Optional CTA button label + tool call (consumed by ActionCard SuggestedAction). */
  cta?: {
    label: string
    tool: string
    args: Record<string, unknown>
  }
  /** Returned when the predictor doesn't have enough data — caller skips. */
  insufficientData?: boolean
}
