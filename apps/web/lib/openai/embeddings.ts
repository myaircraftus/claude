/**
 * Embedding generation — now delegates to the unified AI SDK layer
 * (lib/ai/llm/embed → `embedMany`). The exported `generateEmbeddings`
 * signature is UNCHANGED so every caller (RAG router-classifier, ingestion
 * server, intelligence-query, eval scripts) keeps working as-is.
 *
 * The AI SDK auto-batches to the provider's per-call limit and applies retries,
 * so the previous hand-rolled 100-item batching + exponential backoff is no
 * longer needed. Dimensions are pinned to 1536 to match the pgvector(1536)
 * column (text-embedding-3-large would otherwise return 3072).
 */
import { embedTexts } from '@/lib/ai/llm/embed'

const EMBEDDING_DIMENSIONS = 1536

/**
 * Generate embeddings for an array of text chunks, preserving input order.
 * Returns one { id, embedding } per input chunk.
 */
export async function generateEmbeddings(
  chunks: Array<{ id: string; text: string }>,
): Promise<Array<{ id: string; embedding: number[] }>> {
  if (chunks.length === 0) return []

  const { embeddings } = await embedTexts(
    chunks.map((c) => c.text),
    { dimensions: EMBEDDING_DIMENSIONS },
  )

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `[embeddings] result count ${embeddings.length} != input count ${chunks.length}`,
    )
  }
  // Guard the pgvector(1536) contract: a dimension drift here would silently
  // corrupt retrieval, so fail loudly instead of writing wrong-width vectors.
  const firstLen = embeddings[0]?.length ?? EMBEDDING_DIMENSIONS
  if (firstLen !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `[embeddings] expected ${EMBEDDING_DIMENSIONS} dims, got ${firstLen}`,
    )
  }

  return chunks.map((c, i) => ({ id: c.id, embedding: embeddings[i] }))
}
