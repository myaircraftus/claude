/**
 * Per-model pricing — single source of truth for cost estimation across every
 * provider. Lifted + merged from the old lib/ai/anthropic.ts and
 * lib/ai/openai-vision.ts pricing tables.
 *
 * USD per 1,000,000 tokens. If a model isn't here, cost stays NULL — the
 * ai_activity_log row still lands so spend is never silent; the admin UI just
 * renders "—" for cost on unknown models.
 */
export const PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  // ─── Anthropic (public pricing, 2026-05) ───
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4.0 },

  // ─── OpenAI chat / vision ───
  'gpt-4o': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-vision-preview': { input: 10.0, output: 30.0 }, // legacy

  // ─── OpenAI embeddings (no output tokens billed) ───
  'text-embedding-3-large': { input: 0.13, output: 0.0 },
  'text-embedding-3-small': { input: 0.02, output: 0.0 },

  // ─── Google Gemini — pricing intentionally omitted (preview model);
  //     cost stays NULL rather than guessing. Add here when finalized. ───
}

/**
 * Compute cost in integer cents from per-million pricing.
 * Returns null when the model isn't in the table (unknown cost, not zero cost).
 */
export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const p = PRICING_PER_M_TOKENS[model]
  if (!p) return null
  const dollars = (inputTokens * p.input + outputTokens * p.output) / 1_000_000
  return Math.round(dollars * 100)
}
