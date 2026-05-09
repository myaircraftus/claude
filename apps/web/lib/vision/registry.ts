/**
 * Phase 8 Vision RAG — registry service (Sprint 8.1).
 *
 * Wraps the vision_pages + vision_index_jobs tables behind a typed,
 * org-scoped, zod-validated CRUD layer. Every read filters by
 * organization_id; every write goes through a zod schema first; status
 * transitions are checked against the state machine in types.ts.
 *
 * RLS already enforces org-isolation at the database; the explicit
 * orgId arg is defense-in-depth + makes the typescript type safe at
 * the call site (so we never accidentally fetch by id alone).
 *
 * The Supabase client is passed in (dependency injection) so the same
 * service can be used from API routes (with the user-cookied client)
 * AND from cron / dispatcher code (with the service-role client).
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseJsonBody, // re-exported in case routes import via this file
  safeUuid,
  safeShortStr,
  safeStr,
  safeStrOptional,
  safeIntOptional,
} from '@/lib/validation/common'
import {
  type VisionPage,
  type VisionIndexJob,
  type VisionPageCreatePayload,
  type VisionPagePatch,
  type VisionPageFilter,
  type VisionPageStatus,
  type VisionIndexJobCreatePayload,
  type VisionIndexJobPatch,
  type VisionJobStatus,
  type VisionGpuHost,
  isLegalVisionPageTransition,
  isLegalVisionJobTransition,
} from './types'

export { parseJsonBody }

// ─── Validation schemas ──────────────────────────────────────────────

const VISION_PAGE_STATUS_VALUES = [
  'pending', 'rendering', 'embedding', 'indexed', 'failed', 'review_required',
] as const

const VISION_JOB_STATUS_VALUES = [
  'queued', 'running', 'completed', 'failed',
] as const

const GPU_HOST_VALUES = [
  'modal', 'replicate', 'runpod', 'colab', 'stub',
] as const

export const VisionPageCreateSchema = z.object({
  organization_id: safeUuid,
  source_document_id: safeUuid,
  page_number: z.number().int().min(0).max(10_000),
  page_image_path: safeStr.max(500),
  status: z.enum(VISION_PAGE_STATUS_VALUES).optional(),
  vision_model: safeShortStr.nullable().optional(),
})

export const VisionPagePatchSchema = z.object({
  status: z.enum(VISION_PAGE_STATUS_VALUES).optional(),
  vision_model: safeShortStr.nullable().optional(),
  vision_index_id: safeStrOptional.nullable(),
  confidence_score: z.number().finite().min(0).max(1).nullable().optional(),
  error_message: safeStrOptional.nullable(),
  rendered_at: z.string().datetime().nullable().optional(),
  embedded_at: z.string().datetime().nullable().optional(),
})

export const VisionIndexJobCreateSchema = z.object({
  organization_id: safeUuid,
  vision_page_ids: z.array(safeUuid).min(1).max(500),
  gpu_host: z.enum(GPU_HOST_VALUES).nullable().optional(),
  model_used: safeShortStr.nullable().optional(),
})

export const VisionIndexJobPatchSchema = z.object({
  status: z.enum(VISION_JOB_STATUS_VALUES).optional(),
  gpu_host: z.enum(GPU_HOST_VALUES).nullable().optional(),
  model_used: safeShortStr.nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  error_message: safeStrOptional.nullable(),
})

// ─── vision_pages CRUD ───────────────────────────────────────────────

export async function listVisionPages(
  supabase: SupabaseClient,
  orgId: string,
  filter: VisionPageFilter = {},
): Promise<VisionPage[]> {
  let q = supabase
    .from('vision_pages')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!filter.include_deleted) q = q.is('deleted_at', null)
  if (filter.source_document_id) q = q.eq('source_document_id', filter.source_document_id)
  if (filter.status) {
    q = Array.isArray(filter.status)
      ? q.in('status', filter.status)
      : q.eq('status', filter.status)
  }

  const { data, error } = await q
  if (error) throw new Error(`listVisionPages: ${error.message}`)
  return (data ?? []) as VisionPage[]
}

export async function getVisionPage(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
): Promise<VisionPage | null> {
  const { data, error } = await supabase
    .from('vision_pages')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`getVisionPage: ${error.message}`)
  return (data as VisionPage) ?? null
}

export async function createVisionPage(
  supabase: SupabaseClient,
  payload: VisionPageCreatePayload,
): Promise<VisionPage> {
  const validated = VisionPageCreateSchema.parse(payload)
  const { data, error } = await supabase
    .from('vision_pages')
    .insert(validated)
    .select('*')
    .single()
  if (error) throw new Error(`createVisionPage: ${error.message}`)
  return data as VisionPage
}

export async function updateVisionPage(
  supabase: SupabaseClient,
  id: string,
  patch: VisionPagePatch,
  orgId: string,
): Promise<VisionPage> {
  const validated = VisionPagePatchSchema.parse(patch)

  // Defense-in-depth status-transition check. Postgres only enforces
  // membership in the CHECK constraint; the legal-transitions map in
  // types.ts catches "indexed → pending" and similar invariant breaks.
  if (validated.status) {
    const current = await getVisionPage(supabase, id, orgId)
    if (!current) throw new Error('updateVisionPage: not found or wrong org')
    if (current.status !== validated.status &&
        !isLegalVisionPageTransition(current.status, validated.status)) {
      throw new Error(
        `updateVisionPage: illegal transition ${current.status} → ${validated.status}`,
      )
    }
  }

  const { data, error } = await supabase
    .from('vision_pages')
    .update(validated)
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new Error(`updateVisionPage: ${error.message}`)
  return data as VisionPage
}

export async function softDeleteVisionPage(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from('vision_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
  if (error) throw new Error(`softDeleteVisionPage: ${error.message}`)
}

// ─── vision_index_jobs CRUD ──────────────────────────────────────────

export async function listVisionIndexJobs(
  supabase: SupabaseClient,
  orgId: string,
  status?: VisionJobStatus | VisionJobStatus[],
): Promise<VisionIndexJob[]> {
  let q = supabase
    .from('vision_index_jobs')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (status) {
    q = Array.isArray(status) ? q.in('status', status) : q.eq('status', status)
  }

  const { data, error } = await q
  if (error) throw new Error(`listVisionIndexJobs: ${error.message}`)
  return (data ?? []) as VisionIndexJob[]
}

export async function getVisionIndexJob(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
): Promise<VisionIndexJob | null> {
  const { data, error } = await supabase
    .from('vision_index_jobs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`getVisionIndexJob: ${error.message}`)
  return (data as VisionIndexJob) ?? null
}

export async function createVisionIndexJob(
  supabase: SupabaseClient,
  payload: VisionIndexJobCreatePayload,
): Promise<VisionIndexJob> {
  const validated = VisionIndexJobCreateSchema.parse(payload)
  const { data, error } = await supabase
    .from('vision_index_jobs')
    .insert(validated)
    .select('*')
    .single()
  if (error) throw new Error(`createVisionIndexJob: ${error.message}`)
  return data as VisionIndexJob
}

export async function updateVisionIndexJob(
  supabase: SupabaseClient,
  id: string,
  patch: VisionIndexJobPatch,
  orgId: string,
): Promise<VisionIndexJob> {
  const validated = VisionIndexJobPatchSchema.parse(patch)

  if (validated.status) {
    const current = await getVisionIndexJob(supabase, id, orgId)
    if (!current) throw new Error('updateVisionIndexJob: not found or wrong org')
    if (current.status !== validated.status &&
        !isLegalVisionJobTransition(current.status, validated.status)) {
      throw new Error(
        `updateVisionIndexJob: illegal transition ${current.status} → ${validated.status}`,
      )
    }
  }

  const { data, error } = await supabase
    .from('vision_index_jobs')
    .update(validated)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select('*')
    .single()
  if (error) throw new Error(`updateVisionIndexJob: ${error.message}`)
  return data as VisionIndexJob
}
