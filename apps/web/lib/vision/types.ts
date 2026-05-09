/**
 * Phase 8 Vision RAG — types (Sprint 8.1).
 *
 * TS contract that mirrors `vision_pages` and `vision_index_jobs` from
 * migration 098_vision_index_registry.sql. Read this file together with
 * the migration; they MUST stay in lockstep.
 */

export type VisionPageStatus =
  | 'pending'
  | 'rendering'
  | 'embedding'
  | 'indexed'
  | 'failed'
  | 'review_required'

export type VisionJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export type VisionGpuHost = 'modal' | 'replicate' | 'runpod' | 'colab' | 'stub'

/** State machine — used by the registry service to validate transitions. */
export const VISION_PAGE_TRANSITIONS: Record<VisionPageStatus, VisionPageStatus[]> = {
  pending:         ['rendering', 'failed'],
  rendering:       ['embedding', 'pending', 'failed'],
  embedding:       ['indexed', 'failed', 'review_required'],
  indexed:         ['embedding', 'review_required'],   // re-embed allowed
  failed:          ['pending'],                         // retry path
  review_required: ['indexed', 'failed'],
}

export const VISION_JOB_TRANSITIONS: Record<VisionJobStatus, VisionJobStatus[]> = {
  queued:    ['running', 'failed'],
  running:   ['completed', 'failed'],
  completed: [],
  failed:    ['queued'],   // retry path
}

export interface VisionPage {
  id: string
  organization_id: string
  source_document_id: string
  page_number: number
  page_image_path: string
  status: VisionPageStatus
  vision_model: string | null
  vision_index_id: string | null
  confidence_score: number | null
  error_message: string | null
  rendered_at: string | null
  embedded_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface VisionIndexJob {
  id: string
  organization_id: string
  vision_page_ids: string[]
  status: VisionJobStatus
  gpu_host: VisionGpuHost | null
  model_used: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface VisionPageCreatePayload {
  organization_id: string
  source_document_id: string
  page_number: number
  page_image_path: string
  status?: VisionPageStatus
  vision_model?: string | null
}

export interface VisionPagePatch {
  status?: VisionPageStatus
  vision_model?: string | null
  vision_index_id?: string | null
  confidence_score?: number | null
  error_message?: string | null
  rendered_at?: string | null
  embedded_at?: string | null
}

export interface VisionPageFilter {
  status?: VisionPageStatus | VisionPageStatus[]
  source_document_id?: string
  include_deleted?: boolean
}

export interface VisionIndexJobCreatePayload {
  organization_id: string
  vision_page_ids: string[]
  gpu_host?: VisionGpuHost | null
  model_used?: string | null
}

export interface VisionIndexJobPatch {
  status?: VisionJobStatus
  gpu_host?: VisionGpuHost | null
  model_used?: string | null
  started_at?: string | null
  completed_at?: string | null
  error_message?: string | null
}

/**
 * Helper: is `next` a legal transition from `current`?
 * The registry service uses this as a defense-in-depth check — Postgres
 * doesn't enforce transitions, just the enum's membership in CHECK.
 */
export function isLegalVisionPageTransition(
  current: VisionPageStatus,
  next: VisionPageStatus,
): boolean {
  return VISION_PAGE_TRANSITIONS[current]?.includes(next) ?? false
}

export function isLegalVisionJobTransition(
  current: VisionJobStatus,
  next: VisionJobStatus,
): boolean {
  return VISION_JOB_TRANSITIONS[current]?.includes(next) ?? false
}
