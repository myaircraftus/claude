/**
 * Phase 8 Vision RAG — RunPod worker (TODO, Sprint 8.3).
 *
 * Placeholder. RunPod gives raw GPU pods that we'd run our own
 * ColQwen2 / ColPali container on. Lower per-token cost than
 * Replicate, more setup overhead. Decision pending — see
 * /docs/phase-8-foundation-report.md.
 *
 * Wiring sketch (NOT implemented):
 *   - RUNPOD_API_KEY env var
 *   - Spin up pod template via REST API
 *   - POST embed request to pod's exposed endpoint
 *   - Auto-shutdown pod after batch (cost control)
 */
import type { GpuWorker } from '../gpu-worker'

export const runpodWorker: GpuWorker = {
  id: 'runpod',
  label: 'RunPod (TODO — not implemented)',
  async embed(_pages) {
    throw new Error('runpodWorker not implemented — set VISION_GPU_HOST=stub or implement.')
  },
}
