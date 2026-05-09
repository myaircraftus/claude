/**
 * Phase 8 Vision RAG — Replicate worker (TODO, Sprint 8.3).
 *
 * Placeholder for a future Replicate-hosted ColQwen2 / ColPali
 * deployment. Not implemented in the foundation; the factory
 * (workers/factory.ts) routes to modal-stub regardless of
 * VISION_GPU_HOST until each real backend lands.
 *
 * Wiring sketch (NOT implemented):
 *   - REPLICATE_API_TOKEN env var
 *   - POST https://api.replicate.com/v1/predictions with model version
 *   - poll the prediction until status='succeeded'
 *   - extract output → vision_index_id, embedding_dim, model_used
 *
 * Andy decides Replicate vs Modal vs RunPod; see
 * /docs/phase-8-foundation-report.md.
 */
import type { GpuWorker } from '../gpu-worker'

export const replicateWorker: GpuWorker = {
  id: 'replicate',
  label: 'Replicate (TODO — not implemented)',
  async embed(_pages) {
    throw new Error('replicateWorker not implemented — set VISION_GPU_HOST=stub or implement.')
  },
}
