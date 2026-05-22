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
 * In-memory rerank cache. Two reasons it exists:
 *  1. Determinism — when a Fluid Compute lambda is hot, the same
 *     question gives the same answer on every refresh instead of
 *     flapping between "rerank succeeded" and "fell back to merge
 *     order" if Cohere has a transient 429.
 *  2. Cost — Cohere is the most expensive call in the pipeline; a
 *     trivial LRU cuts the bill on repeated questions (Ask-Logbook
 *     follow-ups, count-style probes, eval reruns).
 *
 * Best-effort, in-memory only. Cross-lambda determinism would need
 * a KV store; the in-memory layer already removes the most common
 * "refresh-and-get-different-result" failure mode for a single user.
 *
 * Key = sha-ish hash of (model, query, ordered chunk_ids). Value =
 * the reranked chunk_id order. The caller intersects this with the
 * fresh candidate set so adding/removing chunks doesn't blow the
 * cache.
 */
const CACHE_MAX = 256
const cache = new Map<string, string[]>()
function cacheKey(model: string, query: string, chunkIds: string[]): string {
  // No real hash — toString concatenation is fine for an in-process cache.
  // The leading length tag prevents prefix collisions across queries.
  return `${model}::${query.length}::${query}::${chunkIds.join(',')}`
}
function cacheGet(key: string): string[] | null {
  const v = cache.get(key)
  if (!v) return null
  // LRU-touch
  cache.delete(key)
  cache.set(key, v)
  return v
}
function cachePut(key: string, value: string[]) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, value)
}

/**
 * One retry on transient Cohere errors (429 rate limit, 5xx). The retry
 * is the cheapest win against "same question gives different answer" —
 * one 429 retry covers ~95% of transient flaps.
 */
async function cohereRerankOnce(args: {
  apiKey: string
  model: string
  query: string
  documents: string[]
  topN: number
}): Promise<Response> {
  return fetch('https://api.cohere.com/v2/rerank', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      query: args.query.slice(0, 4000),
      documents: args.documents,
      top_n: args.topN,
    }),
    signal: AbortSignal.timeout(8000),
  })
}

/**
 * Rerank `chunks` against `query` and return the top `topN` in relevance
 * order. On any failure (no key, error, timeout, empty response) returns
 * `chunks.slice(0, topN)` — the original merge order. Never throws.
 */
export async function rerankChunks<T extends RerankableChunk>(
  query: string,
  chunks: T[],
  topN: number,
): Promise<{ chunks: T[]; reranked: boolean; cached?: boolean }> {
  const apiKey = process.env.COHERE_API_KEY
  if (!apiKey || chunks.length === 0 || topN <= 0) {
    return { chunks: chunks.slice(0, Math.max(0, topN)), reranked: false }
  }

  const candidates = chunks.slice(0, MAX_RERANK_DOCS)
  const model = process.env.COHERE_RERANK_MODEL || 'rerank-v3.5'

  // Cache lookup. The cached value is an ordered chunk_id list — we
  // intersect with the current candidate set, so adding/removing chunks
  // between calls degrades gracefully (we just lose the cache hit).
  const candidateIds = candidates.map((c) => c.chunk_id)
  const key = cacheKey(model, query, candidateIds)
  const cachedIds = cacheGet(key)
  if (cachedIds) {
    const byId = new Map(candidates.map((c) => [c.chunk_id, c]))
    const out: T[] = []
    for (const id of cachedIds) {
      const hit = byId.get(id)
      if (hit) out.push(hit)
      if (out.length >= topN) break
    }
    if (out.length > 0) {
      return { chunks: out.slice(0, topN), reranked: true, cached: true }
    }
  }

  const documents = candidates.map((c) => (c.chunk_text ?? '').slice(0, MAX_DOC_CHARS))
  const requestedTopN = Math.min(topN, candidates.length)

  try {
    let res = await cohereRerankOnce({
      apiKey,
      model,
      query,
      documents,
      topN: requestedTopN,
    })

    // One retry on transient 429 / 5xx. Cohere uses 429 for rate limiting
    // and the retry-after is usually < 1s. A second hit usually wins.
    if (!res.ok && (res.status === 429 || (res.status >= 500 && res.status < 600))) {
      console.warn(
        `[rag/rerank] Cohere ${res.status} — retrying once before falling back to merge order`,
      )
      await new Promise((r) => setTimeout(r, 350))
      res = await cohereRerankOnce({
        apiKey,
        model,
        query,
        documents,
        topN: requestedTopN,
      })
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

    cachePut(
      key,
      reranked.map((c) => c.chunk_id),
    )
    return { chunks: reranked.slice(0, topN), reranked: true }
  } catch (err) {
    // Best-effort: any failure → original merge order, pipeline unaffected.
    console.warn('[rag/rerank] rerank error (ignored):', err)
    return { chunks: chunks.slice(0, topN), reranked: false }
  }
}
