/**
 * OCR review-queue confidence rescore.
 *
 * Every pending `review_queue_items` row points at OCR-pipeline entities that
 * ALREADY carry confidence data — produced by Document AI + ABBYY and the
 * multi-engine arbitrator during ingestion:
 *   - ocr_extracted_events.confidence_overall / _date / _tach / _mechanic
 *   - ocr_entry_segments.confidence
 *   - ocr_page_jobs.arbitration_confidence / ocr_confidence
 *
 * `rescoreReviewItem` collapses that into a single 0-1 confidence so the queue
 * can be triaged: high-confidence rows can be auto-resolved (no human needed),
 * the rest are banded worst-first for the reviewer.
 *
 * IMPORTANT: this is sourced from the OCR pipeline, NOT from Qwen2/vision — the
 * vision pipeline produces visual embeddings only and never emits OCR text or a
 * confidence score. This module is a pure function (no I/O) so it is trivially
 * testable and so the rescore endpoint can run it in a dry-run with no writes.
 */

/** Confidence band for a rescored review item. */
export type ConfidenceBand = 'critical' | 'medium' | 'low' | 'auto'

/** Default auto-resolve cutoff — conservative for airworthiness records. */
export const AUTO_RESOLVE_THRESHOLD = 0.85
/** Band boundaries (see confidenceBand). */
export const BAND_CRITICAL_MAX = 0.3
export const BAND_MEDIUM_MAX = 0.6

/** OCR-pipeline data linked to one review_queue_items row. */
export interface RescoreInput {
  /** Linked ocr_extracted_events row (one logical maintenance event). */
  event?: {
    confidence_overall?: number | null
    event_date?: string | null
    tach_time?: number | string | null
    airframe_tt?: number | string | null
    mechanic_name?: string | null
    mechanic_cert_number?: string | null
    ia_number?: string | null
    raw_text?: string | null
  } | null
  /** Linked ocr_entry_segments row (one OCR text segment). */
  segment?: {
    confidence?: number | null
    text_content?: string | null
    normalized_text?: string | null
  } | null
  /** Linked ocr_page_jobs row (one scanned page). */
  pageJob?: {
    arbitration_confidence?: number | null
    ocr_confidence?: number | null
  } | null
}

export interface RescoreResult {
  /** Calibrated confidence in [0, 1]. */
  score: number
  band: ConfidenceBand
  /** Whether the score came from a stored confidence or the field heuristic. */
  basis: 'stored_confidence' | 'field_heuristic'
}

/** Clamp to [0, 1]; treat a 0-100 percentage as a fraction. */
function normalizeConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0
  // Some engines report 0-100; anything above 1 (and within 100) is a percent.
  const v = n > 1 && n <= 100 ? n / 100 : n
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

/** First finite number in the list, or null. */
function firstNumber(values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/**
 * Bucket a 0-1 score into a band. `auto` (>= threshold) means the rescore
 * considers the item safe to auto-resolve; the other three bands stay in the
 * human queue, worst-first.
 */
export function confidenceBand(
  score: number,
  threshold: number = AUTO_RESOLVE_THRESHOLD,
): ConfidenceBand {
  if (score >= threshold) return 'auto'
  if (score < BAND_CRITICAL_MAX) return 'critical'
  if (score < BAND_MEDIUM_MAX) return 'medium'
  return 'low'
}

/**
 * Re-derive a single confidence for one review queue item from its linked OCR
 * entities. Prefers a confidence the OCR pipeline already computed; only when
 * none exists does it fall back to a field-presence heuristic (the presence of
 * a parsed date / tach / mechanic + readable text is itself a strong signal
 * the page was legible).
 *
 * Pure — never throws, never does I/O.
 */
export function rescoreReviewItem(
  input: RescoreInput,
  threshold: number = AUTO_RESOLVE_THRESHOLD,
): RescoreResult {
  // 1. Prefer a confidence the OCR pipeline already produced. Event-level is
  //    the most specific, then segment, then the page-level arbitration.
  const stored = firstNumber([
    input.event?.confidence_overall,
    input.segment?.confidence,
    input.pageJob?.arbitration_confidence,
    input.pageJob?.ocr_confidence,
  ])
  if (stored != null) {
    const score = normalizeConfidence(stored)
    return { score, band: confidenceBand(score, threshold), basis: 'stored_confidence' }
  }

  // 2. Fallback heuristic — no stored confidence. Score from the success of
  //    structured field extraction + text legibility on the linked entities.
  const ev = input.event
  const text = String(
    input.event?.raw_text ||
      input.segment?.text_content ||
      input.segment?.normalized_text ||
      '',
  )
  let score = 0
  if (ev?.event_date) score += 0.2
  if (ev?.tach_time != null || ev?.airframe_tt != null) score += 0.2
  if (ev?.mechanic_name || ev?.mechanic_cert_number || ev?.ia_number) score += 0.15
  if (text.length > 50) score += 0.2
  if (text.length > 200) score += 0.1
  if (text.length > 0 && !/\[illegible\]/i.test(text)) score += 0.15
  score = score > 1 ? 1 : score

  return { score, band: confidenceBand(score, threshold), basis: 'field_heuristic' }
}
