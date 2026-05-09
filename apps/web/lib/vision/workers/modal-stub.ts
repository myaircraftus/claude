/**
 * Phase 8 Vision RAG — Modal worker (STUB, Sprint 8.3).
 *
 * Returns deterministic mock embedding metadata so downstream
 * dispatcher + retrieval (Sprint 8.4–8.5) have data to query against.
 * Real Modal integration: TODO — needs MODAL_API_KEY + a deployed
 * Modal app running ColQwen2 (defaulted) or ColPali. Andy decides;
 * see /docs/phase-8-foundation-report.md.
 *
 * The stub is keyed by vision_page_id so two calls for the same
 * page produce the same vision_index_id (idempotent).
 */
import { createHash } from 'crypto'
import type { GpuWorker, EmbedResult } from '../gpu-worker'
import type { VisionPage } from '../types'

/**
 * Deterministic stub: HMAC-style hash of vision_page_id → vision_index_id.
 * Real worker will return the actual vector index entry id from the
 * downstream vision_embeddings INSERT.
 */
function stubIndexIdForPage(visionPageId: string): string {
  const h = createHash('sha256').update(`vision-stub:${visionPageId}`).digest('hex')
  return `mock_${h.slice(0, 24)}`
}

export const STUB_MODEL_NAME = 'colqwen2-stub'
export const STUB_EMBEDDING_DIM = 128

export const modalStubWorker: GpuWorker = {
  id: 'stub',
  label: 'Modal (stub mode)',

  async embed(pages: VisionPage[]): Promise<EmbedResult[]> {
    // Mirror what the real worker would do: a roughly-uniform
    // per-page latency, success on most, occasional simulated failure
    // — but keep it deterministic for tests, NOT random. The stub
    // succeeds for every page; failure simulation is a test concern,
    // not a production stub concern.
    return pages.map((p) => ({
      vision_page_id: p.id,
      vision_index_id: stubIndexIdForPage(p.id),
      embedding_dim: STUB_EMBEDDING_DIM,
      model_used: STUB_MODEL_NAME,
      success: true,
    }))
  },
}

/** Exported for tests + the embedding-row insert in Sprint 8.4. */
export { stubIndexIdForPage }
