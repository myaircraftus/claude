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
 * Determinism cache. Cohere is fundamentally best-effort — a 429 or a network
 * blip would have us silently fall back to merge-order, which produces a
 * different top-N than the reranked top-N. Same question hammered N times
 * across a session can therefore swing between two retrieval orderings, which
 * the user sees as wildly different answers. We memoise the SUCCESSFUL rerank
 * outcome by (query, candidate-chunk-id set) and reuse it on subsequent
 * failures, so once we've seen the right ordering once we keep returning it.
 *
 * Lives in module scope → shared across requests within a lambda. A cold
 * lambda repopulates on first successful rerank. LRU-capped so a long-lived
 * lambda can't grow unbounded.
 */
const RERANK_CACHE_MAX = 256
const rerankCache = new Map<string, string[]>()

function rerankCacheKey(query: string, candidates: Array<{ chunk_id: string }>): string {
  const ids = candidates.map((c) => c.chunk_id).join(',')
  return `${query.trim().toLowerCase()}::${ids}`
}

function rememberRerank(key: string, orderedIds: string[]): void {
  if (rerankCache.has(key)) rerankCache.delete(key)
  rerankCache.set(key, orderedIds)
  while (rerankCache.size > RERANK_CACHE_MAX) {
    const oldest = rerankCache.keys().next().value
    if (oldest === undefined) break
    rerankCache.delete(oldest)
  }
}

function recallRerank<T extends RerankableChunk>(key: string, candidates: T[]): T[] | null {
  const cached = rerankCache.get(key)
  if (!cached) return null
  const byId = new Map(candidates.map((c) => [c.chunk_id, c] as const))
  const out = cached.map((id) => byId.get(id)).filter((c): c is T => c != null)
  return out.length > 0 ? out : null
}

/**
 * Rerank `chunks` against `query` and return the top `topN` in relevance
 * order. On any failure (no key, error, timeout, empty response) returns
 * `chunks.slice(0, topN)` — the original merge order — UNLESS we previously
 * cached a successful rerank for this exact (query, candidate-set), in which
 * case we replay that ordering for determinism. Never throws.
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
  const cacheKey = rerankCacheKey(query, candidates)

  // Cached-result short-circuit. If we've previously reranked this exact
  // (query, candidate-set), reuse the order — that's the entire point of the
  // cache, to make repeated identical queries deterministic.
  const cached = recallRerank<T>(cacheKey, candidates)
  if (cached) return { chunks: cached.slice(0, topN), reranked: true }

  // One retry for transient failures (429 / 503 / network blip). Production
  // Cohere occasionally rate-limits in bursts and the retry-after-200ms path
  // succeeds almost every time. Without the retry, the flap would cause the
  // determinism cache to never populate on borderline-busy intervals.
  async function callCohere(): Promise<Response> {
    const model = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5'
    return fetch('https://api.cohere.com/v2/rerank', {
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
      signal: AbortSignal.timeout(8000),
    })
  }

  try {
    let res = await callCohere()
    if (!res.ok && (res.status === 429 || res.status === 503 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 200))
      res = await callCohere()
    }

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

    rememberRerank(cacheKey, reranked.map((c) => c.chunk_id))
    return { chunks: reranked.slice(0, topN), reranked: true }
  } catch (err) {
    // Best-effort: any failure → original merge order, pipeline unaffected.
    console.warn('[rag/rerank] rerank error (ignored):', err)
    return { chunks: chunks.slice(0, topN), reranked: false }
  }
}
