/**
 * Phase 8 Vision RAG — GPU worker interface (Sprint 8.3).
 *
 * Defines the contract every vision-embedding backend implements.
 * Implementations live under workers/ — modal-stub.ts is the only
 * one wired up; replicate / runpod / colab are placeholder files
 * with TODO markers.
 *
 * The dispatcher (dispatcher.ts) is the SOLE caller of worker.embed().
 * API routes never call workers directly — they queue a
 * vision_index_jobs row and a cron / dispatch endpoint hands it off.
 */
import type { VisionPage, VisionGpuHost } from './types'

export interface EmbedResult {
  vision_page_id: string
  /** Foreign key into vision_embeddings (Sprint 8.4). */
  vision_index_id: string
  embedding_dim: number
  model_used: string
  success: boolean
  error?: string
}

export interface GpuWorker {
  /** Host id — embedded in vision_index_jobs.gpu_host. */
  id: VisionGpuHost
  /** Human-readable label for the admin dashboard. */
  label: string
  /** Embed a batch of pages. Implementation may parallelize internally. */
  embed(pages: VisionPage[]): Promise<EmbedResult[]>
}
