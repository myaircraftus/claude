/**
 * Phase 8 Vision RAG — vector index query helpers (Sprint 8.4).
 *
 * Read-only access to the vision_embeddings table:
 *   searchVisionIndex(orgId, queryVector, k=10): top-k by ANN
 *     on summary_vector (HNSW + cosine).
 *   getPatchVectors(visionPageId, orgId): full patch matrix
 *     for late-interaction MaxSim scoring at retrieval time.
 *
 * Also writes — the dispatcher (Sprint 8.3) calls
 * insertVisionEmbedding() when worker.embed() returns a successful
 * result. The stub uses fake vectors generated from a hash of the
 * page id (same determinism trick as stubIndexIdForPage); shape
 * matches what real ColQwen2 output would look like.
 *
 * Sprint 8.5 will turn searchVisionIndex into a real RPC; today
 * it's a stub that returns empty results unless rows exist.
 */
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export interface VisionEmbeddingRow {
  id: string
  organization_id: string
  vision_page_id: string
  model_used: string
  embedding_dim: number
  summary_vector: number[]   // pgvector serializes as JSON array of floats
  patch_vectors: { patches: number[][] }
  patch_count: number
  created_at: string
}

export interface VisionSearchHit {
  vision_page_id: string
  vision_index_id: string
  summary_score: number
  model_used: string
  embedding_dim: number
}

/**
 * Insert (or upsert) a vision_embeddings row. Called by the
 * dispatcher when worker.embed returns success.
 *
 * Uses the (organization_id, vision_page_id) UNIQUE index to
 * upsert: re-embedding a page replaces its row.
 */
export async function insertVisionEmbedding(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    vision_page_id: string
    model_used: string
    embedding_dim: number
    summary_vector: number[]
    patch_vectors: { patches: number[][] }
  },
): Promise<{ id: string }> {
  // Defense-in-depth: dim must match the vector length.
  if (args.summary_vector.length !== args.embedding_dim) {
    throw new Error(
      `insertVisionEmbedding: summary_vector length ${args.summary_vector.length} ≠ embedding_dim ${args.embedding_dim}`,
    )
  }
  // Patch-count denormalization — caller passes patch_vectors,
  // we derive the count.
  const patch_count = args.patch_vectors.patches.length

  const { data, error } = await supabase
    .from('vision_embeddings')
    .upsert({
      organization_id: args.organization_id,
      vision_page_id: args.vision_page_id,
      model_used: args.model_used,
      embedding_dim: args.embedding_dim,
      summary_vector: args.summary_vector,
      patch_vectors: args.patch_vectors,
      patch_count,
    }, { onConflict: 'organization_id,vision_page_id' })
    .select('id')
    .single()
  if (error) throw new Error(`insertVisionEmbedding: ${error.message}`)
  return { id: (data as { id: string }).id }
}

/**
 * Stub deterministic vector generator — used by the modal-stub
 * dispatcher path so the foundation has data to query against.
 *
 * Real worker output (future) will replace this with the actual
 * ColQwen2 / ColPali model output. The shape (128-dim summary +
 * 64-patch matrix) matches what the real models emit.
 */
export function stubVectorsForPage(visionPageId: string): {
  summary_vector: number[]
  patch_vectors: { patches: number[][] }
  embedding_dim: number
} {
  const hash = createHash('sha256').update(`vision-stub:${visionPageId}`).digest()
  // 128-dim summary: deterministic floats in [-1, 1] from hash bytes.
  const summary_vector: number[] = []
  for (let i = 0; i < 128; i++) {
    const b = hash[i % hash.length]
    summary_vector.push(((b - 128) / 128))
  }
  // 64 patches × 128 dim — derive each patch from a salted hash.
  const patches: number[][] = []
  for (let p = 0; p < 64; p++) {
    const phash = createHash('sha256').update(`vision-stub-patch:${visionPageId}:${p}`).digest()
    const patch: number[] = []
    for (let i = 0; i < 128; i++) {
      const b = phash[i % phash.length]
      patch.push(((b - 128) / 128))
    }
    patches.push(patch)
  }
  return {
    summary_vector,
    patch_vectors: { patches },
    embedding_dim: 128,
  }
}

/**
 * Top-k retrieval by cosine-similarity ANN on summary_vector, via the
 * `match_vision_embeddings` RPC (HNSW vector_cosine_ops index, org-scoped).
 * Returns at most `k` results sorted by similarity descending. The dim
 * guard rejects queries that don't match the stored 128-dim ColQwen2
 * embedding.
 *
 * Wave 1.7 — this replaced the Sprint 8.4 stub that returned the most
 * RECENT rows rather than the most SIMILAR. `summary_score` from the RPC
 * is cosine similarity (1 = identical).
 */
export async function searchVisionIndex(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    query_vector: number[]
    k?: number
  },
): Promise<VisionSearchHit[]> {
  const k = args.k ?? 10

  // Dim guard — a clean throw rather than a confusing pgvector dim error.
  if (args.query_vector.length !== 128) {
    throw new Error(
      `searchVisionIndex: query_vector length ${args.query_vector.length} ≠ expected 128`,
    )
  }

  const { data, error } = await supabase.rpc('match_vision_embeddings', {
    p_organization_id: args.organization_id,
    p_query_vector: args.query_vector,
    p_match_count: k,
  })
  if (error) throw new Error(`searchVisionIndex: ${error.message}`)

  return ((data ?? []) as Array<{
    vision_page_id: string
    model_used: string
    embedding_dim: number
    summary_score: number
  }>).map((row) => ({
    vision_page_id: row.vision_page_id,
    vision_index_id: row.vision_page_id,
    summary_score: typeof row.summary_score === 'number' ? row.summary_score : 0,
    model_used: row.model_used,
    embedding_dim: row.embedding_dim,
  }))
}

/**
 * Fetch the full per-patch matrix for one vision page. Used by
 * Sprint 8.5's late-interaction MaxSim re-ranker.
 */
export async function getPatchVectors(
  supabase: SupabaseClient,
  visionPageId: string,
  orgId: string,
): Promise<{ patches: number[][]; embedding_dim: number; patch_count: number } | null> {
  const { data, error } = await supabase
    .from('vision_embeddings')
    .select('patch_vectors, embedding_dim, patch_count')
    .eq('vision_page_id', visionPageId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`getPatchVectors: ${error.message}`)
  if (!data) return null
  const row = data as { patch_vectors: { patches: number[][] }; embedding_dim: number; patch_count: number }
  return {
    patches: row.patch_vectors.patches,
    embedding_dim: row.embedding_dim,
    patch_count: row.patch_count,
  }
}

// ─── Schemas (also exported from /lib/vision/schemas.ts) ─────────────

export const SearchQuerySchema = z.object({
  query_vector: z.array(z.number().finite()).length(128),
  k: z.number().int().min(1).max(100).optional(),
})
