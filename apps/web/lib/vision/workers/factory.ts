/**
 * Phase 8 Vision RAG — worker factory (Sprint 8.3).
 *
 * Selects the GPU worker for a given dispatch run. Reads:
 *   - VISION_GPU_HOST env var: 'modal' | 'replicate' | 'runpod' | 'colab' | 'stub'
 *   - The corresponding API key for that host (MODAL_API_KEY etc.)
 *
 * Routing logic:
 *   1. If VISION_GPU_HOST is unset or 'stub' → return modal-stub.
 *   2. If host is set but the corresponding key is missing → return
 *      modal-stub + log a warning (don't block dev).
 *   3. If host has a real implementation → return that worker.
 *      Otherwise (replicate/runpod/colab — TODO) → return modal-stub.
 *
 * The factory NEVER throws on missing config — rendering + indexing
 * should keep working in development against the stub even when
 * production credentials aren't set.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GpuWorker } from '../gpu-worker'
import { modalStubWorker } from './modal-stub'
import { createModalWorker } from './modal'
import { replicateWorker } from './replicate'
import { runpodWorker } from './runpod'
import { colabWorker } from './colab'
import { createServiceSupabase } from '@/lib/supabase/server'

const HOSTS_WITH_REAL_IMPL = new Set<string>([
  'stub',
  'modal',
  // 'replicate', // ← uncomment when replicate.ts is implemented
  // 'runpod',
  // 'colab',
])

interface FactoryDeps {
  /** Override env-var read for testability. */
  envHost?: string
  envHasKey?: Record<string, boolean>
  /** Supabase client used by real workers that mint signed URLs. */
  supabase?: SupabaseClient
}

export function getGpuWorker(deps: FactoryDeps = {}): GpuWorker {
  const host = (deps.envHost ?? process.env.VISION_GPU_HOST ?? 'stub').toLowerCase()

  // 1. Stub explicit / nothing configured → stub.
  if (!host || host === 'stub' || host === 'modal-stub') {
    return modalStubWorker
  }

  // 2. Real implementation not yet available → fall back to stub.
  if (!HOSTS_WITH_REAL_IMPL.has(host)) {
    if (host === 'replicate') return replicateWorker
    if (host === 'runpod') return runpodWorker
    if (host === 'colab') return colabWorker
    // Unknown host string — stub.
    return modalStubWorker
  }

  // 3. Real impl exists; check credentials.
  const keyPresent =
    host === 'modal'     ? (
        (deps.envHasKey?.MODAL_API_KEY     ?? !!process.env.MODAL_API_KEY) &&
        (deps.envHasKey?.MODAL_ENDPOINT_URL ?? !!process.env.MODAL_ENDPOINT_URL)
      ) :
    host === 'replicate' ? (deps.envHasKey?.REPLICATE_API_TOKEN ?? !!process.env.REPLICATE_API_TOKEN) :
    host === 'runpod'    ? (deps.envHasKey?.RUNPOD_API_KEY    ?? !!process.env.RUNPOD_API_KEY) :
    host === 'colab'     ? (deps.envHasKey?.COLAB_NGROK_URL   ?? !!process.env.COLAB_NGROK_URL) :
    false

  if (!keyPresent) {
    console.warn(`[vision/factory] VISION_GPU_HOST=${host} but credentials missing — falling back to stub.`)
    return modalStubWorker
  }

  // 4. Build the real worker.
  if (host === 'modal') {
    const supabase = deps.supabase ?? createServiceSupabase()
    return createModalWorker({ supabase })
  }

  // Real impl set on the host but not yet wired here → stub.
  return modalStubWorker
}
