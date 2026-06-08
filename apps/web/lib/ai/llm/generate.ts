/**
 * generateLlmText — unified plain-text generation over the AI SDK.
 *
 * Replaces ad-hoc `openai.chat.completions.create(...)` text calls. Returns
 * normalized token usage + estimated cost, and (when a supabase client + log
 * scope are supplied) writes an ai_activity_log row. Logging is OPT-IN so
 * pure-compute callers, agents (which log via the runner), and offline scripts
 * aren't forced to thread a Supabase client through.
 */
import { generateText, type ModelMessage } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_OPENAI_CHAT_MODEL,
  normalizeUsage,
  resolveLanguageModel,
} from './provider'
import { estimateCostCents } from './pricing'
import { writeActivityLog } from './log'
import type { ActivityLogScope, LlmUsage, ProviderName } from './types'

export interface GenerateLlmTextArgs {
  provider?: ProviderName
  /** Model id, e.g. 'gpt-4o-mini'. Defaults to the OpenAI chat model. */
  model?: string
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

export interface LlmTextResult {
  text: string
  model: string
  usage: LlmUsage
  costUsdCents: number | null
  durationMs: number
}

export async function generateLlmText(args: GenerateLlmTextArgs): Promise<LlmTextResult> {
  const provider = args.provider ?? 'openai'
  const modelId = args.model ?? DEFAULT_OPENAI_CHAT_MODEL
  const started = Date.now()
  const common = {
    model: resolveLanguageModel(provider, modelId),
    system: args.system,
    maxOutputTokens: args.maxOutputTokens,
    temperature: args.temperature,
    topP: args.topP,
    topK: args.topK,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    providerOptions: args.providerOptions as Record<string, Record<string, any>> | undefined,
    abortSignal: args.abortSignal,
    maxRetries: args.maxRetries,
  }
  try {
    const res = args.messages
      ? await generateText({ ...common, messages: args.messages })
      : await generateText({ ...common, prompt: args.prompt ?? '' })
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
    return { text: res.text, model: modelId, usage, costUsdCents, durationMs }
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
