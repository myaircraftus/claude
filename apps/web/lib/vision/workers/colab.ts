/**
 * Phase 8 Vision RAG — Colab worker (TODO, Sprint 8.3).
 *
 * Placeholder for a Colab Pro-hosted notebook + ngrok-tunneled API.
 * The cheapest option ($10/mo Colab Pro) for the initial 234k
 * embedding backfill of the existing 351 documents. Per
 * docs/new implementation/context.md line 178: "Triggers when
 * current sequence completes + GPU worker accounts ready (Colab
 * Pro $10/mo OR RunPod $30 minimum)."
 *
 * Wiring sketch (NOT implemented):
 *   - COLAB_NGROK_URL env var
 *   - POST batch to the tunneled FastAPI endpoint
 *   - retry logic for tunnel disconnects (Colab idle-timeout)
 */
import type { GpuWorker } from '../gpu-worker'

export const colabWorker: GpuWorker = {
  id: 'colab',
  label: 'Colab Pro + ngrok (TODO — not implemented)',
  async embed(_pages) {
    throw new Error('colabWorker not implemented — set VISION_GPU_HOST=stub or implement.')
  },
}
