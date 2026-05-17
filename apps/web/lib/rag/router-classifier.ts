/**
 * Embedding-based query-intent classifier for the RAG router.
 *
 * The keyword router (lib/rag/query-router.ts) is fast and high-precision
 * but only fires when a query matches a hand-written pattern. This module
 * is the FALLBACK: when no keyword pattern matches, we embed the query and
 * compare it (cosine similarity) against one centroid vector per intent.
 *
 * Centroids are the element-wise mean of each intent's example-phrase
 * embeddings. They are computed once per process (module-level cache) and
 * persisted to the private `rag-indexes` Storage bucket as JSON so cold
 * starts can reuse them instead of re-embedding every example phrase.
 *
 * Embedding model: this uses `generateEmbeddings` from lib/openai/embeddings
 * for BOTH the example phrases and the user query. That helper reads the
 * `OPENAI_EMBEDDING_MODEL` env var (defaulting to text-embedding-3-large)
 * and always requests 1536 dimensions. Using the same helper for examples
 * and query guarantees the vectors are directly comparable. The persisted
 * file records the active model name so a model change invalidates the
 * cache automatically.
 *
 * This module NEVER throws — any failure degrades to a safe default.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import type { QueryStrategy } from './query-router'

// ---------------------------------------------------------------------------
// Public contract.
// ---------------------------------------------------------------------------

export type QueryIntent =
  | 'compliance_check'
  | 'exact_lookup'
  | 'history_audit'
  | 'location_structural'
  | 'general_semantic'

/** Map each classified intent onto a concrete retrieval strategy. */
export const INTENT_STRATEGY: Record<QueryIntent, QueryStrategy> = {
  // 'tree' here means vector + tree — see indexesForStrategy in query-router.
  compliance_check: 'tree',
  exact_lookup: 'bm25',
  history_audit: 'hybrid_all',
  location_structural: 'tree',
  general_semantic: 'vector',
}

/**
 * Minimum cosine similarity required to trust the classifier. Below this the
 * router falls back to plain 'vector' search rather than a specialised index.
 */
export const ROUTER_CONFIDENCE_THRESHOLD = 0.65

// ---------------------------------------------------------------------------
// Intent example phrases — the training set for each centroid.
// ---------------------------------------------------------------------------

const INTENT_EXAMPLES: Record<QueryIntent, string[]> = {
  compliance_check: [
    'is the annual current',
    'when does the annual expire',
    'is this aircraft compliant',
    'what ADs are outstanding',
    'has the 100-hour been done',
    'is the transponder check current',
  ],
  exact_lookup: [
    'find part number',
    'show me AD 2019-09-10',
    'where is serial number',
    'P/N 61452',
  ],
  history_audit: [
    'full maintenance history',
    'show all logbook entries',
    'complete record of',
    'prebuy analysis',
    'everything done to this aircraft',
  ],
  location_structural: [
    'in the engine section',
    'in chapter 71',
    'where in the manual',
    'which section covers',
  ],
  general_semantic: [
    'what work was done on the alternator',
    'oil change history',
    'who signed the annual',
  ],
}

// All intents, in a stable order — used for iteration.
const ALL_INTENTS: QueryIntent[] = [
  'compliance_check',
  'exact_lookup',
  'history_audit',
  'location_structural',
  'general_semantic',
]

// ---------------------------------------------------------------------------
// Persistence.
// ---------------------------------------------------------------------------

const STORAGE_BUCKET = 'rag-indexes'
const STORAGE_PATH = 'intent-embeddings.json'
/** Bump this whenever INTENT_EXAMPLES changes to invalidate the cached file. */
const CENTROIDS_VERSION = 1

/** Persisted centroid file shape. */
interface CentroidsFile {
  version: number
  /** Embedding model the centroids were computed with — guards cache reuse. */
  model: string
  /** One centroid vector per intent. */
  centroids: Record<QueryIntent, number[]>
}

/** The embedding model `generateEmbeddings` will actually use. */
function activeEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
}

// ---------------------------------------------------------------------------
// Module-level cache — centroids are computed at most once per process.
// ---------------------------------------------------------------------------

let centroidCache: Map<QueryIntent, number[]> | null = null
let centroidBuild: Promise<Map<QueryIntent, number[]> | null> | null = null

// ---------------------------------------------------------------------------
// Vector math.
// ---------------------------------------------------------------------------

/** Element-wise mean of a set of equal-length vectors. */
function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return []
  const dims = vectors[0].length
  const out = new Array<number>(dims).fill(0)
  for (const vec of vectors) {
    for (let i = 0; i < dims; i++) {
      out[i] += vec[i] ?? 0
    }
  }
  for (let i = 0; i < dims; i++) {
    out[i] /= vectors.length
  }
  return out
}

/** Cosine similarity of two equal-length vectors; 0 if either is degenerate. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ---------------------------------------------------------------------------
// Centroid load / build.
// ---------------------------------------------------------------------------

/** Try to download persisted centroids; return null if missing or stale. */
async function loadPersistedCentroids(): Promise<Map<QueryIntent, number[]> | null> {
  try {
    const supabase = createServiceSupabase()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(STORAGE_PATH)
    if (error || !data) return null

    const file = JSON.parse(await data.text()) as CentroidsFile
    if (file.version !== CENTROIDS_VERSION) return null
    if (file.model !== activeEmbeddingModel()) return null
    if (!file.centroids) return null

    const map = new Map<QueryIntent, number[]>()
    for (const intent of ALL_INTENTS) {
      const vec = file.centroids[intent]
      if (!Array.isArray(vec) || vec.length === 0) return null
      map.set(intent, vec)
    }
    return map
  } catch {
    return null
  }
}

/** Persist freshly built centroids to Storage. Best-effort — never throws. */
async function persistCentroids(map: Map<QueryIntent, number[]>): Promise<void> {
  try {
    const supabase = createServiceSupabase()
    const centroids = {} as Record<QueryIntent, number[]>
    for (const intent of ALL_INTENTS) {
      centroids[intent] = map.get(intent) ?? []
    }
    const file: CentroidsFile = {
      version: CENTROIDS_VERSION,
      model: activeEmbeddingModel(),
      centroids,
    }
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(STORAGE_PATH, blob, {
        upsert: true,
        contentType: 'application/json',
      })
  } catch {
    // Persistence is an optimisation — a failure here just means the next
    // cold start recomputes embeddings. Swallow it.
  }
}

/**
 * Build centroids by embedding every example phrase and averaging per intent.
 * All phrases go through `generateEmbeddings` in one call so they share the
 * exact same embedding path the query will later use.
 */
async function buildCentroids(): Promise<Map<QueryIntent, number[]>> {
  // Flatten every example phrase into one embedding request, tagging each
  // chunk id with its intent so we can group the results back afterwards.
  const chunks: Array<{ id: string; text: string }> = []
  for (const intent of ALL_INTENTS) {
    INTENT_EXAMPLES[intent].forEach((phrase, i) => {
      chunks.push({ id: `${intent}#${i}`, text: phrase })
    })
  }

  const embedded = await generateEmbeddings(chunks)
  const byId = new Map(embedded.map((e) => [e.id, e.embedding]))

  const map = new Map<QueryIntent, number[]>()
  for (const intent of ALL_INTENTS) {
    const vectors: number[][] = []
    INTENT_EXAMPLES[intent].forEach((_phrase, i) => {
      const vec = byId.get(`${intent}#${i}`)
      if (vec) vectors.push(vec)
    })
    map.set(intent, meanVector(vectors))
  }
  return map
}

/**
 * Resolve the centroid map: served from the in-process cache, then from
 * Storage, then rebuilt from scratch (and persisted). Concurrent callers
 * during a cold start share a single in-flight build. Returns null on
 * unrecoverable failure (e.g. no OpenAI key).
 */
async function getCentroids(): Promise<Map<QueryIntent, number[]> | null> {
  if (centroidCache) return centroidCache
  if (centroidBuild) return centroidBuild

  centroidBuild = (async () => {
    // 1. Reuse a persisted file if it exists and matches version + model.
    const persisted = await loadPersistedCentroids()
    if (persisted) {
      centroidCache = persisted
      return persisted
    }

    // 2. Otherwise embed the example phrases and persist the result.
    try {
      const built = await buildCentroids()
      centroidCache = built
      await persistCentroids(built)
      return built
    } catch {
      // Embedding failed (no key, transient error, etc.). Don't cache the
      // failure — a later call can retry.
      return null
    }
  })()

  try {
    return await centroidBuild
  } finally {
    centroidBuild = null
  }
}

// ---------------------------------------------------------------------------
// Classification.
// ---------------------------------------------------------------------------

/**
 * Classify a free-text query into one of the five `QueryIntent` values using
 * cosine similarity against per-intent embedding centroids.
 *
 * NEVER throws. On any failure (no OpenAI key, embedding error, storage
 * error, empty query) returns `{ intent: 'general_semantic', confidence: 0 }`
 * — the caller treats confidence 0 as "fall back to plain vector search".
 */
export async function classifyQueryIntent(
  query: string,
): Promise<{ intent: QueryIntent; confidence: number }> {
  const fallback = { intent: 'general_semantic' as QueryIntent, confidence: 0 }

  const q = (query ?? '').trim()
  if (!q) return fallback

  try {
    const centroids = await getCentroids()
    if (!centroids) return fallback

    // Embed the query through the SAME path used for the example phrases.
    const embedded = await generateEmbeddings([{ id: 'query', text: q }])
    const queryVec = embedded[0]?.embedding
    if (!queryVec || queryVec.length === 0) return fallback

    let bestIntent: QueryIntent = 'general_semantic'
    let bestScore = -Infinity
    for (const intent of ALL_INTENTS) {
      const centroid = centroids.get(intent)
      if (!centroid || centroid.length === 0) continue
      const score = cosineSimilarity(queryVec, centroid)
      if (score > bestScore) {
        bestScore = score
        bestIntent = intent
      }
    }

    if (!Number.isFinite(bestScore)) return fallback
    return { intent: bestIntent, confidence: bestScore }
  } catch {
    return fallback
  }
}
