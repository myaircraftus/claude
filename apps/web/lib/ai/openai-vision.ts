/**
 * OpenAI Vision multimodal wrapper (Phase 8 Sprint 8.6).
 *
 * Parallel to lib/ai/anthropic.ts — does NOT touch /lib/ai/openai.ts
 * (which doesn't exist; existing routes import OpenAI directly).
 * This module is the single multimodal call surface for Phase 8's
 * vision-answer fallback.
 *
 * Why a fresh wrapper rather than extending an existing helper:
 *   - lib/ai/anthropic.ts is Anthropic-specific (callAnthropic API)
 *   - existing routes that call OpenAI Vision (squawks/from-photo,
 *     work-orders/[id]/messages/upload) each roll their own; no
 *     shared helper to extend
 *   - Phase 8's vision fallback needs structured citation parsing
 *     and confidence-keyword extraction that's specific to the
 *     "answer from N pages of an aircraft document" task — putting
 *     it here keeps that logic testable in one place
 *
 * Cost-logging via the existing ai_activity_log shape (see
 * lib/ai/anthropic.ts:289 for the canonical insert).
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_VISION_MODEL = 'gpt-4o'

/** GPT-4o pricing (Mar 2025): $5/1M in, $15/1M out. */
const PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o':              { input:  5.00, output: 15.00 },
  'gpt-4o-mini':         { input:  0.15, output:  0.60 },
  'gpt-4-vision-preview':{ input: 10.00, output: 30.00 }, // legacy
}

export interface VisionImageRef {
  /** Signed HTTPS URL — caller is responsible for getting a public-fetchable URL. */
  url: string
  /** Optional context the prompt can reference (e.g. "page 3 of N20957 logbook"). */
  label?: string
}

export interface VisionCallArgs {
  prompt: string
  systemPrompt?: string
  images: VisionImageRef[]
  model?: string
  maxTokens?: number
  temperature?: number
  /** OPENAI_API_KEY override for tests. */
  apiKey?: string
}

export interface VisionCallResult {
  answer: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  costUsdCents: number | null
  /** Raw response object for advanced callers; usually unused. */
  raw?: unknown
}

/** Compute cost in cents from per-million pricing. Null when model unknown. */
function computeCostCents(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICING_PER_M_TOKENS[model]
  if (!p) return null
  const inputCost = (inputTokens / 1_000_000) * p.input * 100   // dollars → cents
  const outputCost = (outputTokens / 1_000_000) * p.output * 100
  return Math.round(inputCost + outputCost)
}

/**
 * Single-shot OpenAI Vision call. Throws on hard error; the caller
 * decides whether to surface the error or treat as low-confidence.
 *
 * The image array maps to one user-message content block per image,
 * followed by the prompt text. System prompt (if any) goes first.
 */
export async function callOpenAiVision(args: VisionCallArgs): Promise<VisionCallResult> {
  const apiKey = args.apiKey ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('callOpenAiVision: OPENAI_API_KEY not set')
  }
  if (args.images.length === 0) {
    throw new Error('callOpenAiVision: at least one image required')
  }
  if (args.images.length > 10) {
    throw new Error(`callOpenAiVision: too many images (${args.images.length}), max 10 per call`)
  }

  const model = args.model ?? DEFAULT_VISION_MODEL
  const client = new OpenAI({ apiKey })

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = []
  for (const img of args.images) {
    userContent.push({ type: 'image_url', image_url: { url: img.url } })
  }
  userContent.push({ type: 'text', text: args.prompt })

  const messages: any[] = []
  if (args.systemPrompt) {
    messages.push({ role: 'system', content: args.systemPrompt })
  }
  messages.push({ role: 'user', content: userContent })

  const t0 = Date.now()
  const completion = await client.chat.completions.create({
    model,
    messages,
    max_tokens: args.maxTokens ?? 800,
    temperature: args.temperature ?? 0.2,
  })
  const durationMs = Date.now() - t0

  const answer = completion.choices?.[0]?.message?.content ?? ''
  const inputTokens = completion.usage?.prompt_tokens ?? 0
  const outputTokens = completion.usage?.completion_tokens ?? 0

  return {
    answer: typeof answer === 'string' ? answer : '',
    model,
    inputTokens,
    outputTokens,
    durationMs,
    costUsdCents: computeCostCents(model, inputTokens, outputTokens),
    raw: completion,
  }
}

/** Mirrors the lib/ai/anthropic.ts:289 ai_activity_log shape. */
export interface AiActivityLogRow {
  /** Real org id, or null for platform-level activity (substituted at
   *  write time with the Phase 17 system-org sentinel). */
  organization_id: string | null
  user_id?: string | null
  scope: string
  entity_kind?: string | null
  entity_id?: string | null
  model: string
  status: 'success' | 'failure' | 'cap-exceeded' | 'rate-limited' | 'timeout'
  input_tokens?: number
  output_tokens?: number
  cost_usd_cents?: number | null
  duration_ms?: number
  error_message?: string
  context?: Record<string, unknown>
}

const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000'

export async function logVisionActivity(
  supabase: SupabaseClient,
  row: AiActivityLogRow,
): Promise<void> {
  const { error } = await supabase.from('ai_activity_log').insert({
    organization_id: row.organization_id ?? SYSTEM_ORG_ID,
    user_id: row.user_id ?? null,
    scope: row.scope,
    entity_kind: row.entity_kind ?? null,
    entity_id: row.entity_id ?? null,
    model: row.model,
    status: row.status,
    input_tokens: row.input_tokens ?? null,
    output_tokens: row.output_tokens ?? null,
    cost_usd_cents: row.cost_usd_cents ?? null,
    duration_ms: row.duration_ms ?? null,
    error_message: row.error_message ?? null,
    context: row.context ?? {},
  })
  if (error) {
    // Per the lib/ai/anthropic.ts pattern: log failures must never
    // propagate up to break the LLM call itself.
    console.error('[openai-vision] ai_activity_log insert error:', error.message)
  }
}
