/**
 * Anthropic client (Spec 5.6) — server-only.
 *
 * NEVER import this from a client component. ANTHROPIC_API_KEY is a
 * server-only env var; same security model as RAPIDAPI_ADSB_EXCHANGE_KEY
 * from sprint 4.3.
 *
 * Migrated to the Vercel AI SDK (@ai-sdk/anthropic). The exported surface —
 * callAnthropic / AnthropicCallArgs / AnthropicCallResult / logCapExceeded /
 * DEFAULT_MODEL / SYSTEM_ORG_ID / ActivityLogScope — is UNCHANGED, so the ~8
 * callers (extractors, predictors, support triage, voice/vision routes) and
 * ai-triage.test.ts keep working as-is. Retries + timeout are now handled by
 * the SDK (maxRetries + abortSignal) instead of the hand-rolled backoff loop.
 *
 * Every call writes a row to ai_activity_log so we have cost + observability.
 */

import { anthropic } from '@ai-sdk/anthropic'
import { generateText, type ModelMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 3

/** Default model used by callers that don't specify one. Override via
 *  args.model on each call when you want a cheaper/faster variant. */
export const DEFAULT_MODEL = 'claude-sonnet-4-5'

/**
 * Cost per million tokens, USD. Public Anthropic pricing as of 2026-05-03.
 * If a model isn't in this map, cost_usd_cents stays NULL — the row still
 * lands in ai_activity_log so spend isn't silent, the admin UI just shows
 * "—" for cost on unknown models.
 */
const PRICING_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4.0 },
}

/**
 * Multimodal attachment — image or PDF document fetched by URL or
 * inlined as base64. Used by Claude Vision for receipt/invoice
 * extraction (Spec 7.3). Anthropic supports image (PNG/JPEG/GIF/WebP)
 * + document (PDF) content blocks.
 */
export interface AnthropicAttachment {
  kind: 'image' | 'document'
  /** "image/png", "image/jpeg", "image/webp", "application/pdf", … */
  media_type: string
  /** EITHER base64 data OR a public URL Anthropic can fetch. Exactly one. */
  data?: string
  url?: string
}

export interface AnthropicCallArgs {
  /** System prompt — keep persona-stable, task-specific. */
  system: string
  /** User message. JSON-shaped output requests should be in the system or
   *  user prompt; we don't enforce a JSON-only schema here. */
  user: string
  /** Optional multimodal attachments rendered alongside the user text.
   *  When present, the request becomes multimodal (Spec 7.3 vision). */
  attachments?: AnthropicAttachment[]
  /** Override the default model for this call. */
  model?: string
  /** Hard upper bound on output tokens. Default 1024. */
  max_tokens?: number
  temperature?: number
  /** Per-call timeout in ms. Default 30s — vision calls override to 60s. */
  timeout_ms?: number
  /** Max retry attempts on 429/5xx. Default 3. */
  max_attempts?: number
}

export interface AnthropicCallResult {
  text: string
  model: string
  input_tokens: number
  output_tokens: number
  /** Wall-clock ms including retries. */
  duration_ms: number
  /** Estimated cost in USD cents (×100 multiplier — keep integer). NULL
   *  when the model isn't in PRICING_PER_M_TOKENS. */
  cost_usd_cents: number | null
}

export interface ActivityLogScope {
  /** Real org id, or `null` when the activity is platform-level (public
   *  ticket triage, alert evaluators, etc.). The activity logger
   *  substitutes the system-org sentinel UUID for null values so the
   *  ai_activity_log FK is always satisfied (Phase 17 Sprint 17.6). */
  organization_id: string | null
  user_id?: string | null
  scope: string
  entity_kind?: string | null
  entity_id?: string | null
  /** Free-form context — do NOT include raw user PII. */
  context?: Record<string, unknown>
}

/**
 * Sentinel UUID for the System organization. Inserted by migration 118.
 * Whenever a code path needs to write ai_activity_log but has no real
 * org context (public-form triage, alert sweeps, smoke jobs), we
 * substitute this id at write time.
 */
export const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Run an Anthropic Messages call + log the outcome to ai_activity_log.
 *
 * The supabase client should be the SERVICE-ROLE client (createServiceSupabase)
 * so the log row writes regardless of caller's RLS context. The route's
 * auth check happens BEFORE this is called; this is just the LLM step.
 */
export async function callAnthropic(
  supabase: SupabaseClient,
  args: AnthropicCallArgs,
  log: ActivityLogScope,
): Promise<AnthropicCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — server-only env var, never reaches client',
    )
  }

  const model = args.model ?? DEFAULT_MODEL
  const max_tokens = args.max_tokens ?? 1024
  const max_attempts = args.max_attempts ?? MAX_ATTEMPTS
  const timeout_ms = args.timeout_ms ?? DEFAULT_TIMEOUT_MS
  const started = Date.now()

  try {
    const res = await generateText({
      model: anthropic(model),
      system: args.system,
      messages: [{ role: 'user', content: buildUserContent(args) }] as ModelMessage[],
      maxOutputTokens: max_tokens,
      temperature: args.temperature,
      // SDK retries (total attempts = maxRetries + 1) replace the old loop.
      maxRetries: Math.max(0, max_attempts - 1),
      abortSignal: AbortSignal.timeout(timeout_ms),
    })

    const input_tokens = res.usage?.inputTokens ?? 0
    const output_tokens = res.usage?.outputTokens ?? 0
    const cost_usd_cents = estimateCostCents(model, input_tokens, output_tokens)
    const duration_ms = Date.now() - started

    await writeActivityLog(supabase, {
      ...log,
      model,
      status: 'success',
      input_tokens,
      output_tokens,
      cost_usd_cents,
      duration_ms,
    })

    return { text: res.text, model, input_tokens, output_tokens, duration_ms, cost_usd_cents }
  } catch (e: unknown) {
    const duration_ms = Date.now() - started
    const message = e instanceof Error ? e.message : String(e)
    const isTimeout =
      (e instanceof DOMException && e.name === 'TimeoutError') || /timeout|aborted/i.test(message)
    const status: 'failure' | 'rate-limited' | 'timeout' = isTimeout
      ? 'timeout'
      : /\b429\b|rate[- ]?limit/i.test(message)
        ? 'rate-limited'
        : 'failure'

    await writeActivityLog(supabase, {
      ...log,
      model,
      status,
      duration_ms,
      error_message: message.slice(0, 500),
    }).catch(() => {
      /* don't mask the original error */
    })

    throw e instanceof Error ? e : new Error(message)
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Build the AI SDK user-message `content`. With no attachments it's the plain
 * string user prompt (matches the original shape). With attachments it becomes
 * an array of content parts — one per attachment (image / file) plus the text
 * block — the shape Claude Vision (Spec 7.3) requires.
 *
 * Source format: `data` (base64) takes precedence over `url`. For images we
 * build a data URL; for documents (PDF) we pass base64/URL via a file part.
 */
type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string }
  | { type: 'file'; data: string; mediaType: string }

function buildUserContent(args: AnthropicCallArgs): string | UserContentPart[] {
  if (!args.attachments || args.attachments.length === 0) return args.user

  const parts: UserContentPart[] = []
  for (const a of args.attachments) {
    if (a.kind === 'image') {
      const image = a.data ? `data:${a.media_type};base64,${a.data}` : a.url
      if (image) parts.push({ type: 'image', image })
    } else {
      // document (PDF) → file part
      const data = a.data ?? a.url
      if (data) parts.push({ type: 'file', data, mediaType: a.media_type })
    }
  }
  parts.push({ type: 'text', text: args.user })
  return parts
}

function estimateCostCents(
  model: string,
  input_tokens: number,
  output_tokens: number,
): number | null {
  const p = PRICING_PER_M_TOKENS[model]
  if (!p) return null
  // tokens × ($/M tokens) ÷ 1e6 = USD; ×100 → cents.
  const dollars = (input_tokens * p.input + output_tokens * p.output) / 1_000_000
  return Math.round(dollars * 100)
}

async function writeActivityLog(
  supabase: SupabaseClient,
  row: ActivityLogScope & {
    model: string
    status: 'success' | 'failure' | 'cap-exceeded' | 'rate-limited' | 'timeout'
    input_tokens?: number
    output_tokens?: number
    cost_usd_cents?: number | null
    duration_ms?: number
    error_message?: string
  },
): Promise<void> {
  const { error } = await supabase.from('ai_activity_log').insert({
    // Substitute the system-org sentinel for null org context (Sprint 17.6).
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
    // Logging failure must NEVER break the LLM call itself.
    console.error('[anthropic] ai_activity_log insert error:', error.message)
  }
}

/* ─── Cost-cap helpers ──────────────────────────────────────────────── */

/**
 * Idempotent cost-cap log: write a 'cap-exceeded' row and return without
 * making the LLM call. Used by the regenerate route when an approval has
 * too many line items to safely batch-explain.
 */
export async function logCapExceeded(
  supabase: SupabaseClient,
  log: ActivityLogScope & { reason: string },
): Promise<void> {
  await writeActivityLog(supabase, {
    ...log,
    model: DEFAULT_MODEL,
    status: 'cap-exceeded',
    error_message: log.reason,
  })
}
