/**
 * generateLlmObject — unified structured (JSON) generation over the AI SDK.
 *
 * Replaces the pervasive `response_format: { type: 'json_object' }` + manual
 * `JSON.parse` pattern with `generateObject` + a Zod schema (typed + retried).
 *
 * MIGRATION NOTE: to avoid regressions vs the old loose-JSON parsing (which
 * defaulted invalid fields rather than throwing), callers should build LENIENT
 * schemas using `.catch(...)` / `.default(...)` / `.optional()` so a slightly
 * off-spec model response coerces to a safe value instead of failing the whole
 * call — mirroring the prior hand-rolled validation.
 */
import { generateObject, type ModelMessage } from 'ai'
import type { ZodType } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_OPENAI_CHAT_MODEL,
  normalizeUsage,
  resolveLanguageModel,
} from './provider'
import { estimateCostCents } from './pricing'
import { writeActivityLog } from './log'
import type { ActivityLogScope, LlmUsage, ProviderName } from './types'

export interface GenerateLlmObjectArgs<T> {
  provider?: ProviderName
  model?: string
  schema: ZodType<T>
  schemaName?: string
  schemaDescription?: string
  system?: string
  /** Provide EITHER prompt OR messages. */
  prompt?: string
  messages?: ModelMessage[]
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  topK?: number
  /** Provider-specific options, e.g. { google: { thinkingConfig: { thinkingBudget: 0 } } }. */
  providerOptions?: Record<string, Record<string, unknown>>
  abortSignal?: AbortSignal
  maxRetries?: number
  /** When BOTH are provided, an ai_activity_log row is written. */
  supabase?: SupabaseClient
  log?: ActivityLogScope
}

export interface LlmObjectResult<T> {
  object: T
  model: string
  usage: LlmUsage
  costUsdCents: number | null
  durationMs: number
}

export async function generateLlmObject<T>(
  args: GenerateLlmObjectArgs<T>,
): Promise<LlmObjectResult<T>> {
  const provider = args.provider ?? 'openai'
  const modelId = args.model ?? DEFAULT_OPENAI_CHAT_MODEL
  const started = Date.now()
  // OpenAI's generateObject path defaults to STRICT json_schema (strict:true),
  // which rejects any schema whose `required` omits a property — i.e. every
  // .optional()/.nullish()/.catch()/.default() field — and forbids `default` /
  // additionalProperties:true (z.record / .passthrough()). Our schemas are
  // intentionally lenient (mirroring the old json_object + JSON.parse path), so
  // turn strict enforcement OFF for OpenAI and let the Zod parse stay the real
  // validator. Callers can still override via providerOptions.openai. Anthropic
  // and Google are unaffected (Google already tolerates these schemas).
  const providerOptions =
    provider === 'openai'
      ? {
          ...args.providerOptions,
          openai: { strictJsonSchema: false, ...(args.providerOptions?.openai ?? {}) },
        }
      : args.providerOptions
  const common = {
    model: resolveLanguageModel(provider, modelId),
    schema: args.schema,
    schemaName: args.schemaName,
    schemaDescription: args.schemaDescription,
    system: args.system,
    maxOutputTokens: args.maxOutputTokens,
    temperature: args.temperature,
    topP: args.topP,
    topK: args.topK,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions: providerOptions as Record<string, Record<string, any>> | undefined,
    abortSignal: args.abortSignal,
    maxRetries: args.maxRetries,
  }
  try {
    const res = args.messages
      ? await generateObject({ ...common, messages: args.messages })
      : await generateObject({ ...common, prompt: args.prompt ?? '' })
    const usage = normalizeUsage(res.usage)
    const durationMs = Date.now() - started
    const costUsdCents = estimateCostCents(modelId, usage.inputTokens, usage.outputTokens)
    if (args.supabase && args.log) {
      await writeActivityLog(args.supabase, {
        ...args.log,
        model: modelId,
        status: 'success',
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cost_usd_cents: costUsdCents,
        duration_ms: durationMs,
      })
    }
    return { object: res.object as T, model: modelId, usage, costUsdCents, durationMs }
  } catch (err) {
    if (args.supabase && args.log) {
      const msg = err instanceof Error ? err.message : String(err)
      await writeActivityLog(args.supabase, {
        ...args.log,
        model: modelId,
        status: 'failure',
        duration_ms: Date.now() - started,
        error_message: msg.slice(0, 500),
      }).catch(() => {})
    }
    throw err
  }
}
