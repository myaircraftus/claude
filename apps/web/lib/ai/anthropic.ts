/**
 * Anthropic client (Spec 5.6) — server-only.
 *
 * NEVER import this from a client component. ANTHROPIC_API_KEY is a
 * server-only env var; same security model as RAPIDAPI_ADSB_EXCHANGE_KEY
 * from sprint 4.3.
 *
 * Uses fetch() against the Messages API directly to avoid pulling in
 * @anthropic-ai/sdk (saves bundle, keeps deploy clean). The shape is
 * intentionally narrow — callers pass system + user prompts, get back
 * a structured result with token counts. Retry-on-429-or-5xx with
 * exponential backoff. AbortSignal.timeout caps every call.
 *
 * Every call writes a row to ai_activity_log so we have cost +
 * observability from day one. This is the FIRST production LLM use; the
 * activity-log path is the foundation other 5.x sprints reuse.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
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
  'claude-opus-4-5':            { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5':          { input:  3.00, output: 15.00 },
  'claude-3-5-haiku-latest':    { input:  0.80, output:  4.00 },
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
  organization_id: string
  user_id?: string | null
  scope: string
  entity_kind?: string | null
  entity_id?: string | null
  /** Free-form context — do NOT include raw user PII. */
  context?: Record<string, unknown>
}

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
      'ANTHROPIC_API_KEY is not set — server-only env var, never reaches client'
    )
  }

  const model = args.model ?? DEFAULT_MODEL
  const max_tokens = args.max_tokens ?? 1024
  const max_attempts = args.max_attempts ?? MAX_ATTEMPTS
  const timeout_ms = args.timeout_ms ?? DEFAULT_TIMEOUT_MS
  const started = Date.now()

  let lastErr: unknown = null
  for (let attempt = 1; attempt <= max_attempts; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens,
          temperature: args.temperature,
          system: args.system,
          messages: [{ role: 'user', content: buildMessageContent(args) }],
        }),
        signal: AbortSignal.timeout(timeout_ms),
      })

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        // Retryable. Exponential backoff with jitter.
        const wait = baseBackoffMs(attempt)
        await sleep(wait)
        lastErr = new Error(`anthropic ${res.status}`)
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`anthropic ${res.status}: ${body.slice(0, 240)}`)
      }

      const json = (await res.json()) as AnthropicMessageResponse
      const text = extractText(json)
      const input_tokens = json.usage?.input_tokens ?? 0
      const output_tokens = json.usage?.output_tokens ?? 0
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

      return { text, model, input_tokens, output_tokens, duration_ms, cost_usd_cents }
    } catch (e: unknown) {
      lastErr = e
      const isTimeout = e instanceof DOMException && e.name === 'TimeoutError'
      // Timeout once = retry once; second timeout = bail out.
      if (isTimeout && attempt < max_attempts) {
        continue
      }
      // Non-retryable → break.
      if (!isRetryable(e)) break
    }
  }

  const duration_ms = Date.now() - started
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr)
  const status: 'failure' | 'rate-limited' | 'timeout' =
    lastErr instanceof DOMException && lastErr.name === 'TimeoutError'  ? 'timeout'
    : /\b429\b/.test(message)                                            ? 'rate-limited'
    :                                                                       'failure'

  await writeActivityLog(supabase, {
    ...log,
    model,
    status,
    duration_ms,
    error_message: message.slice(0, 500),
  }).catch(() => { /* don't mask the original error */ })

  throw lastErr instanceof Error ? lastErr : new Error(message)
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

/**
 * Build the Messages API `content` field. When no attachments are present,
 * the content is the simple string user prompt (matches the original
 * shape from sprint 5.6). When attachments ARE present, content becomes
 * an array with one text block + one block per attachment — required
 * shape for Claude Vision.
 *
 * Source format: `data` (base64) takes precedence over `url`. Caller
 * passes one or the other; in 7.3 we use base64 because the storage
 * bucket is private and signed URLs add latency + a network hop.
 */
function buildMessageContent(args: AnthropicCallArgs): unknown {
  if (!args.attachments || args.attachments.length === 0) return args.user

  const blocks: Array<Record<string, unknown>> = []
  for (const a of args.attachments) {
    const source = a.data
      ? { type: 'base64', media_type: a.media_type, data: a.data }
      : a.url
        ? { type: 'url', url: a.url }
        : null
    if (!source) continue
    blocks.push({ type: a.kind, source })
  }
  blocks.push({ type: 'text', text: args.user })
  return blocks
}

function baseBackoffMs(attempt: number): number {
  const base = 250 * Math.pow(2, attempt - 1)
  return base + Math.floor(Math.random() * base / 2)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryable(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'TimeoutError') return true
  if (e instanceof Error && /429|5\d\d/.test(e.message)) return true
  return false
}

interface AnthropicMessageResponse {
  content?: Array<{ type: string; text?: string }>
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string
}

function extractText(json: AnthropicMessageResponse): string {
  const blocks = json.content ?? []
  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!)
    .join('\n')
    .trim()
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
    organization_id: row.organization_id,
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
