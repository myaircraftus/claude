/**
 * Phase 8 Vision RAG — MaxSim late-interaction scoring (Sprint 8.5).
 *
 * Pure math. No I/O. The ColPali / ColQwen2 retrieval contract is:
 *   - Each query produces a sequence of token vectors (one per
 *     prompt token).
 *   - Each document page produces a sequence of patch vectors
 *     (one per image patch — typically 64-1024 patches).
 *   - The page's score for the query is the SUM, over query tokens,
 *     of the MAX cosine similarity between that token and any
 *     patch on the page.
 *
 *      MaxSim(Q, D) = Σ_q∈Q max_{d∈D} cos(q, d)
 *
 * The summed-max captures "every query token must match at least
 * one part of the page" which is the right semantic for OCR-free
 * document retrieval.
 *
 * Edge cases handled:
 *   - Zero-length query or document → 0.
 *   - Zero-vector token (norm=0) → contributes 0 to the sum (not NaN).
 *   - Mismatched dim within a token vs patch matrix → throws — this
 *     is a programmer error, not a runtime condition we should mask.
 */

/** Dot product of two equal-length vectors. */
function dot(a: readonly number[], b: readonly number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Euclidean L2 norm. */
function norm(v: readonly number[]): number {
  let s = 0
  for (const x of v) s += x * x
  return Math.sqrt(s)
}

/**
 * Cosine similarity. Returns 0 (not NaN) when either vector has
 * zero norm — the calling code should treat that as "no match"
 * rather than crashing on Infinity / NaN downstream.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dim mismatch ${a.length} vs ${b.length}`)
  }
  const na = norm(a)
  const nb = norm(b)
  if (na === 0 || nb === 0) return 0
  return dot(a, b) / (na * nb)
}

/**
 * MaxSim score. Higher = better match.
 *
 * Time complexity O(|Q| × |D| × dim). For the typical
 * ColQwen2 numbers (16-32 query tokens, 64-256 patches per page,
 * 128-dim) this is < 1ms per page in JavaScript.
 *
 * Returns 0 for either side empty — lets the caller treat empty
 * embeddings as "page didn't match" rather than special-casing.
 */
export function maxSim(
  queryVectors: readonly (readonly number[])[],
  patchVectors: readonly (readonly number[])[],
): number {
  if (queryVectors.length === 0 || patchVectors.length === 0) return 0

  let sum = 0
  for (const q of queryVectors) {
    let best = -Infinity
    for (const p of patchVectors) {
      const sim = cosine(q, p)
      if (sim > best) best = sim
    }
    if (Number.isFinite(best)) sum += best
  }
  return sum
}

/**
 * Normalized version: divide by query token count so scores are
 * comparable across different query lengths. Range: [-1, 1] in theory,
 * realistically [0, 1] for any sensibly-trained vision-language model.
 */
export function normalizedMaxSim(
  queryVectors: readonly (readonly number[])[],
  patchVectors: readonly (readonly number[])[],
): number {
  if (queryVectors.length === 0) return 0
  return maxSim(queryVectors, patchVectors) / queryVectors.length
}
