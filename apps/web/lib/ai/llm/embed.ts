/**
 * embedTexts — unified text embedding over the AI SDK (`embedMany`).
 *
 * The SDK auto-batches to the provider's per-call limit and applies retries, so
 * this replaces the hand-rolled 100-item batching + exponential backoff that
 * lived in lib/openai/embeddings.ts. Dimensions default to 1536 to match the
 * pgvector(1536) column (text-embedding-3-large would otherwise emit 3072).
 */
import { embedMany } from 'ai'
import { DEFAULT_EMBEDDING_MODEL, resolveEmbeddingModel } from './provider'

export interface EmbedTextsOptions {
  model?: string
  /** Output dimension. Defaults to 1536 (the pgvector column width). */
  dimensions?: number
  maxRetries?: number
  maxParallelCalls?: number
  abortSignal?: AbortSignal
}

export interface EmbedTextsResult {
  embeddings: number[][]
  tokens: number
  model: string
}

export async function embedTexts(
  values: string[],
  opts: EmbedTextsOptions = {},
): Promise<EmbedTextsResult> {
  const modelId = opts.model || DEFAULT_EMBEDDING_MODEL
  const dimensions = opts.dimensions ?? 1536
  if (values.length === 0) return { embeddings: [], tokens: 0, model: modelId }

  const { embeddings, usage } = await embedMany({
    model: resolveEmbeddingModel(modelId),
    values,
    maxRetries: opts.maxRetries ?? 6,
    maxParallelCalls: opts.maxParallelCalls,
    abortSignal: opts.abortSignal,
    providerOptions: { openai: { dimensions } },
  })

  return {
    embeddings,
    tokens: (usage as { tokens?: number } | undefined)?.tokens ?? 0,
    model: modelId,
  }
}
