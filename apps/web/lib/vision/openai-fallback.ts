/**
 * Phase 8 Vision RAG — OpenAI Vision answer fallback (Sprint 8.6).
 *
 * Triggered when ColQwen2/MaxSim retrieval returns low combined
 * confidence (or when stub mode produces uninformative results).
 * Loads up to N page images via signed URLs from the vision-pages
 * storage bucket, sends them to GPT-4o with the original query,
 * parses the response into { answer, confidence, citations }, logs
 * one row to ai_activity_log.
 *
 * Cost-conscious by design:
 *   - Hard cap of 5 page images per call (the brief says
 *     "1-5 pages only sent to OpenAI Vision (cost control)" — see
 *     PHASE 8 hard rules in Claude_Code_Implementation_Spec.md).
 *   - 800-token max output; the model's job is "concise answer +
 *     which page(s) supported it", not long-form prose.
 *   - Confidence parsing is keyword-based (no second LLM call).
 *
 * The fallback runs at the API-route layer, NOT inside hybridRetrieve
 * — keeping retrieval pure-retrieval and answer-generation in the
 * /api/vision/answer route.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { callOpenAiVision, logVisionActivity, DEFAULT_VISION_MODEL } from '@/lib/ai/openai-vision'
import { getPageImageUrl, VISION_PAGES_BUCKET } from './storage'
import type { VisionPage } from './types'

export const FALLBACK_MAX_PAGES = 5

export interface FallbackAnswer {
  answer: string
  /** 0-1 confidence — keyword-derived from the answer text. */
  confidence: number
  /** Page numbers (0-indexed) the answer claims to be grounded in. */
  citations: number[]
  /** Whether the call actually fired. False if no images / no key / stub mode. */
  invoked: boolean
  model: string
  /** Latency of the OpenAI call (ms); 0 if not invoked. */
  durationMs: number
}

export interface FallbackInput {
  organizationId: string
  userId?: string
  query: string
  candidatePages: VisionPage[]
  /** If set, override the per-call max-pages cap (still hard-capped at 5). */
  maxPages?: number
}

const SYSTEM_PROMPT = `You are an aircraft records analyst. Answer the user's question using ONLY the page images provided. If the images don't contain the answer, say so explicitly. After your answer, list the page numbers that supported it on a line starting with "PAGES:" (e.g. "PAGES: 0, 2"). State your confidence on a line starting with "CONFIDENCE:" using one of: "HIGH", "MEDIUM", "LOW".`

/**
 * Map the model's CONFIDENCE: token to a 0-1 float.
 * HIGH → 0.9, MEDIUM → 0.7, LOW → 0.4. Default 0.7 when missing /
 * unrecognized. Also looks at fuzzier signals ("highly confident",
 * "I am not sure", etc.) so the model doesn't have to follow the
 * format perfectly.
 */
export function parseConfidence(answer: string): number {
  const m = answer.match(/CONFIDENCE:\s*(HIGH|MEDIUM|LOW)/i)
  if (m) {
    const tag = m[1].toUpperCase()
    if (tag === 'HIGH') return 0.9
    if (tag === 'MEDIUM') return 0.7
    if (tag === 'LOW') return 0.4
  }
  // Fuzzy fallbacks — model didn't use the explicit format.
  const lower = answer.toLowerCase()
  if (/highly confident|very confident|confidently/.test(lower)) return 0.9
  if (/not sure|uncertain|unclear|cannot determine|don'?t know/.test(lower)) return 0.4
  return 0.7
}

/** Extract the comma-separated page numbers from a "PAGES: 0, 2" line. */
export function parseCitations(answer: string): number[] {
  // Match the PAGES: line through end-of-line so a stray non-numeric
  // token mid-list ("PAGES: 0, abc, 5") doesn't truncate the capture
  // at the first non-[0-9,\s] character.
  const m = answer.match(/PAGES:\s*([^\n\r]+)/i)
  if (!m) return []
  return m[1]
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0)
}

/**
 * Build the user prompt — the query plus a numbered list of which
 * page corresponds to which image. The order MUST match the order
 * of images in the API call below.
 */
function buildUserPrompt(query: string, pages: VisionPage[]): string {
  const lines: string[] = []
  lines.push(`Question: ${query}`)
  lines.push('')
  lines.push('The following images are pages from an aircraft document. Each image is labeled with its page number:')
  pages.forEach((p, i) => {
    lines.push(`  Image ${i + 1} → page ${p.page_number}`)
  })
  lines.push('')
  lines.push('Answer the question based on these images. Then list which page numbers supported your answer and your confidence level.')
  return lines.join('\n')
}

/**
 * Whether the fallback can actually run in the current environment.
 * Returns false (the foundation default) if OPENAI_API_KEY is missing
 * or VISION_FALLBACK_MODE='stub' is set — letting tests / dev exercise
 * the surrounding code path without burning OpenAI credit.
 */
export function isFallbackEnabled(): boolean {
  if (process.env.VISION_FALLBACK_MODE === 'stub') return false
  if (!process.env.OPENAI_API_KEY) return false
  return true
}

/**
 * Stub answer used when the fallback can't run (no key, stub mode).
 * Deterministic from the query so tests can assert.
 */
export function stubFallbackAnswer(query: string, pages: VisionPage[]): FallbackAnswer {
  return {
    answer: `[stub fallback] No OpenAI Vision call was made. Query was: ${query}. ${pages.length} candidate page(s) were available. Set OPENAI_API_KEY and unset VISION_FALLBACK_MODE to enable real answers.`,
    confidence: 0.5,
    citations: pages.slice(0, 1).map((p) => p.page_number),
    invoked: false,
    model: 'stub',
    durationMs: 0,
  }
}

/**
 * Run the fallback. The orchestration:
 *   1. Cap pages at FALLBACK_MAX_PAGES (or maxPages override).
 *   2. If !isFallbackEnabled() → return stub answer.
 *   3. For each capped page, get a 5-min signed URL from the
 *      vision-pages bucket.
 *   4. Build the prompt with query + page-number labels.
 *   5. Call gpt-4o vision.
 *   6. Parse confidence + citations; log to ai_activity_log;
 *      return structured answer.
 */
export async function openAiVisionAnswer(
  supabase: SupabaseClient,
  input: FallbackInput,
): Promise<FallbackAnswer> {
  const cap = Math.min(input.maxPages ?? FALLBACK_MAX_PAGES, FALLBACK_MAX_PAGES)
  const pages = input.candidatePages.slice(0, cap)

  if (pages.length === 0) {
    return {
      answer: 'No candidate pages provided.',
      confidence: 0.0,
      citations: [],
      invoked: false,
      model: 'none',
      durationMs: 0,
    }
  }

  if (!isFallbackEnabled()) {
    return stubFallbackAnswer(input.query, pages)
  }

  // Get signed URLs for each page.
  const imageRefs: Array<{ url: string; label: string; pageNumber: number }> = []
  for (const p of pages) {
    if (!p.page_image_path) continue
    try {
      const url = await getPageImageUrl(supabase, p.page_image_path, 300)
      imageRefs.push({ url, label: `page ${p.page_number}`, pageNumber: p.page_number })
    } catch (err) {
      // A missing image isn't fatal — just skip and reduce the set.
      console.warn(`[openai-fallback] couldn't get URL for ${p.page_image_path}:`, err)
    }
  }

  if (imageRefs.length === 0) {
    return {
      answer: 'Candidate pages had no fetchable images. Check vision-pages bucket and page_image_path values.',
      confidence: 0.0,
      citations: [],
      invoked: false,
      model: 'none',
      durationMs: 0,
    }
  }

  const prompt = buildUserPrompt(input.query, pages)

  let result
  try {
    result = await callOpenAiVision({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      images: imageRefs.map((r) => ({ url: r.url, label: r.label })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await logVisionActivity(supabase, {
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      scope: 'vision-fallback',
      entity_kind: 'vision_search',
      model: DEFAULT_VISION_MODEL,
      status: 'failure',
      error_message: message,
      context: { query: input.query, page_count: imageRefs.length },
    })
    throw err
  }

  const confidence = parseConfidence(result.answer)
  const citations = parseCitations(result.answer)

  await logVisionActivity(supabase, {
    organization_id: input.organizationId,
    user_id: input.userId ?? null,
    scope: 'vision-fallback',
    entity_kind: 'vision_search',
    model: result.model,
    status: 'success',
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd_cents: result.costUsdCents,
    duration_ms: result.durationMs,
    context: {
      query: input.query,
      page_count: imageRefs.length,
      confidence,
      citation_count: citations.length,
    },
  })

  return {
    answer: result.answer,
    confidence,
    citations,
    invoked: true,
    model: result.model,
    durationMs: result.durationMs,
  }
}

/** Re-exported so the answer route can include it in its response. */
export { VISION_PAGES_BUCKET }

/**
 * Threshold below which the answer route should invoke the fallback.
 * 0.3 default per the spec stub; configurable via env.
 */
export const DEFAULT_FALLBACK_THRESHOLD = 0.3

export function readFallbackThreshold(): number {
  const env = process.env.VISION_FALLBACK_THRESHOLD
  if (env) {
    const n = Number(env)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return DEFAULT_FALLBACK_THRESHOLD
}
