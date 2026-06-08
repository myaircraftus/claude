/**
 * Provider registry — resolves a (provider, modelId) pair to a Vercel AI SDK
 * model instance, and centralizes provider/env quirks in one place.
 */
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { EmbeddingModel, LanguageModel } from 'ai'
import type { LlmUsage, ProviderName } from './types'

/**
 * Google/Gemini in this app authenticates with GEMINI_API_KEY (not the AI SDK
 * provider's default GOOGLE_GENERATIVE_AI_API_KEY) — construct explicitly so we
 * don't silently fail with "no key". OpenAI + Anthropic read their standard env
 * vars (OPENAI_API_KEY / ANTHROPIC_API_KEY) automatically.
 */
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
})

export const DEFAULT_OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o'
export const DEFAULT_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'

/** Resolve a (provider, modelId) pair to an AI SDK language model. */
export function resolveLanguageModel(provider: ProviderName, modelId: string): LanguageModel {
  switch (provider) {
    case 'anthropic':
      return anthropic(modelId)
    case 'google':
      return google(modelId)
    case 'openai':
    default:
      // Chat Completions API — matches the app's prior openai.chat.completions usage.
      return openai.chat(modelId)
  }
}

/** OpenAI text-embedding model (the only embedding provider in use). */
export function resolveEmbeddingModel(
  modelId: string = DEFAULT_EMBEDDING_MODEL,
): EmbeddingModel {
  return openai.embedding(modelId)
}

/**
 * Normalize a provider/SDK usage object to our LlmUsage shape. Defensive about
 * v4 (promptTokens/completionTokens) vs v5+ (inputTokens/outputTokens) so a
 * field rename can never silently zero our token accounting.
 */
export function normalizeUsage(u: unknown): LlmUsage {
  const usage = (u ?? {}) as Record<string, number | undefined>
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0
  const totalTokens = usage.totalTokens ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

export { anthropic, google, openai }
