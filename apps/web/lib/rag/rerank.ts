/**
 * Cross-encoder reranking via Cohere Rerank — Wave 1 RAG accuracy upgrade.
 *
 * The hybrid retrieval merge (vector + BM25 + PageIndex tree) ranks candidates
 * by a fixed linear blend of three normalized scores. That blend is a decent
 * recall filter but a weak *precision* signal. A cross-encoder rerank pass
 * re-scores each (query, chunk) pair jointly — the single biggest precision
 * lever in a RAG pipeline. Pattern: retrieve a WIDE candidate set, rerank,
 * keep the true top-N.
 *
 * STRICTLY best-effort — `rerankChunks` NEVER throws. With no COHERE_API_KEY,
 * or on any network/API error/timeout, it returns the input order unchanged
 * (sliced to topN). So the pipeline behaves EXACTLY as it did pre-rerank
 * until a key is present — same graceful-degradation contract as HyDE.
 */

/** Minimal shape a chunk must expose to be rerankable. */
export interface RerankableChunk {
  chunk_id: string
  chunk_text: string
}

/** True when a Cohere key is configured — used only for logging/telemetry. */
export function isRerankEnabled(): boolean {
  return Boolean(process.env.COHERE_API_KEY)
}

/** Cohere has a hard cap of 1000 documents per rerank call; stay well under. */
const MAX_RERANK_DOCS = 200
/** Trim each document so a long chunk can't blow the request size. */
const MAX_DOC_CHARS = 4000

/**
 * Rerank `chunks` against `query` and return the top `topN` in relevance
 * order. On any failure (no key, error, timeout, empty response) returns
 * `chunks.slice(0, topN)` — the original merge order. Never throws.
 */
export async function rerankChunks<T extends RerankableChunk>(
  query: string,
  chunks: T[],
  topN: number,
): Promise<{ chunks: T[]; reranked: boolean }> {
  const apiKey = process.env.COHERE_API_KEY
  if (!apiKey || chunks.length === 0 || topN <= 0) {
    return { chunks: chunks.slice(0, Math.max(0, topN)), reranked: false }
  }

  const candidates = chunks.slice(0, MAX_RERANK_DOCS)

  try {
    const model = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5'
    const res = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        query: query.slice(0, 4000),
        documents: candidates.map((c) => (c.chunk_text ?? '').slice(0, MAX_DOC_CHARS)),
        top_n: Math.min(topN, candidates.length),
      }),
      // Rerank is fast (~100-300ms); cap so a stall can't hang the query.
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.warn(`[rag/rerank] Cohere rerank HTTP ${res.status} — falling back to merge order`)
      return { chunks: chunks.slice(0, topN), reranked: false }
    }

    const body = (await res.json()) as {
      results?: Array<{ index: number; relevance_score: number }>
    }
    const results = body.results
    if (!Array.isArray(results) || results.length === 0) {
      return { chunks: chunks.slice(0, topN), reranked: false }
    }

    // Cohere returns results sorted by relevance desc. Map index → candidate.
    const reranked = results
      .filter((r) => Number.isInteger(r.index) && r.index >= 0 && r.index < candidates.length)
      .map((r) => candidates[r.index])

    if (reranked.length === 0) {
      return { chunks: chunks.slice(0, topN), reranked: false }
    }
    return { chunks: reranked.slice(0, topN), reranked: true }
  } catch (err) {
    // Best-effort: any failure → original merge order, pipeline unaffected.
    console.warn('[rag/rerank] rerank error (ignored):', err)
    return { chunks: chunks.slice(0, topN), reranked: false }
  }
}
