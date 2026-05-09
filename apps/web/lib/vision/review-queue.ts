/**
 * Phase 8 Vision RAG — review queue + feedback service (Sprint 8.7).
 *
 * Two distinct surfaces:
 *
 *   Review queue (vision_review_queue): admin triage for pages with
 *   low retrieval confidence or failed indexing. Status transitions:
 *     pending → reviewed_ok | reviewed_problem | dismissed
 *
 *   Feedback (vision_feedback): per-(query × page) thumbs from end
 *   users. Append-only via upsert on the unique (user, query, page)
 *   index — re-thumbing replaces the rating, doesn't double-row.
 *
 * Both tables created in migration 100_vision_review_queue.sql which
 * is NOT applied yet — Andy applies manually.
 */
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  parseJsonBody,
  safeUuid,
  safeStrOptional,
  safeStr,
} from '@/lib/validation/common'

export type ReviewReason = 'low_confidence' | 'failed_index' | 'user_flag'
export type ReviewStatus = 'pending' | 'reviewed_ok' | 'reviewed_problem' | 'dismissed'

const REASON_VALUES = ['low_confidence', 'failed_index', 'user_flag'] as const
const STATUS_VALUES = ['pending', 'reviewed_ok', 'reviewed_problem', 'dismissed'] as const

export interface VisionReviewItem {
  id: string
  organization_id: string
  vision_page_id: string
  search_query: string | null
  confidence_score: number | null
  reason: ReviewReason
  status: ReviewStatus
  reviewer_user_id: string | null
  reviewer_notes: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface VisionFeedback {
  id: string
  organization_id: string
  search_query: string
  vision_page_id: string
  rating: -1 | 0 | 1
  user_id: string
  created_at: string
}

// ─── State machine for review_queue ──────────────────────────────────

const REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  pending:           ['reviewed_ok', 'reviewed_problem', 'dismissed'],
  reviewed_ok:       [],   // terminal
  reviewed_problem:  [],   // terminal
  dismissed:         ['pending'],   // un-dismiss path
}

export function isLegalReviewTransition(current: ReviewStatus, next: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[current]?.includes(next) ?? false
}

// ─── Schemas ─────────────────────────────────────────────────────────

export const ReviewItemCreateSchema = z.object({
  organization_id: safeUuid,
  vision_page_id: safeUuid,
  search_query: safeStrOptional.nullable(),
  confidence_score: z.number().finite().min(0).max(1).nullable().optional(),
  reason: z.enum(REASON_VALUES),
})

export const ReviewItemPatchSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  reviewer_notes: safeStrOptional.nullable(),
})

export const FeedbackSchema = z.object({
  organization_id: safeUuid,
  search_query: safeStr.max(2000),
  vision_page_id: safeUuid,
  rating: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  user_id: safeUuid,
})

// ─── review_queue CRUD ───────────────────────────────────────────────

export interface ReviewListFilter {
  status?: ReviewStatus | ReviewStatus[]
  reason?: ReviewReason
  limit?: number
}

export async function listReviewQueue(
  supabase: SupabaseClient,
  orgId: string,
  filter: ReviewListFilter = {},
): Promise<VisionReviewItem[]> {
  let q = supabase
    .from('vision_review_queue')
    .select('*')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 200)

  if (filter.status) {
    q = Array.isArray(filter.status) ? q.in('status', filter.status) : q.eq('status', filter.status)
  }
  if (filter.reason) q = q.eq('reason', filter.reason)

  const { data, error } = await q
  if (error) throw new Error(`listReviewQueue: ${error.message}`)
  return (data ?? []) as VisionReviewItem[]
}

export async function getReviewItem(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
): Promise<VisionReviewItem | null> {
  const { data, error } = await supabase
    .from('vision_review_queue')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`getReviewItem: ${error.message}`)
  return (data as VisionReviewItem) ?? null
}

export async function addToReviewQueue(
  supabase: SupabaseClient,
  payload: z.infer<typeof ReviewItemCreateSchema>,
): Promise<VisionReviewItem> {
  const validated = ReviewItemCreateSchema.parse(payload)
  const { data, error } = await supabase
    .from('vision_review_queue')
    .insert(validated)
    .select('*')
    .single()
  if (error) throw new Error(`addToReviewQueue: ${error.message}`)
  return data as VisionReviewItem
}

export async function markReviewed(
  supabase: SupabaseClient,
  id: string,
  orgId: string,
  args: {
    status: ReviewStatus
    reviewerUserId: string
    notes?: string | null
  },
): Promise<VisionReviewItem> {
  const current = await getReviewItem(supabase, id, orgId)
  if (!current) throw new Error('markReviewed: not found in this org')
  if (current.status !== args.status &&
      !isLegalReviewTransition(current.status, args.status)) {
    throw new Error(`markReviewed: illegal transition ${current.status} → ${args.status}`)
  }

  const patch: Record<string, unknown> = {
    status: args.status,
    reviewer_user_id: args.reviewerUserId,
    reviewer_notes: args.notes ?? null,
  }
  if (args.status !== 'pending') {
    patch.reviewed_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('vision_review_queue')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error) throw new Error(`markReviewed: ${error.message}`)
  return data as VisionReviewItem
}

// ─── Auto-enqueue helpers (callers from retriever / dispatcher) ──────

/**
 * Insert a low-confidence review row when fallback fires.
 * Idempotent on (org × page × query) — duplicate enqueues are
 * deliberately allowed (a user asking twice may re-flag the same
 * page; the queue compresses naturally as admin reviews).
 */
export async function enqueueLowConfidence(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    visionPageId: string
    searchQuery: string
    confidenceScore: number
  },
): Promise<void> {
  await addToReviewQueue(supabase, {
    organization_id: args.organizationId,
    vision_page_id: args.visionPageId,
    search_query: args.searchQuery,
    confidence_score: args.confidenceScore,
    reason: 'low_confidence',
  }).catch((err) => {
    console.warn('[vision/review-queue] enqueueLowConfidence failed:', err)
  })
}

/**
 * Insert a failed-index review row from the dispatcher when a job
 * fails on > 50% of its pages.
 */
export async function enqueueFailedIndex(
  supabase: SupabaseClient,
  args: {
    organizationId: string
    visionPageIds: string[]
  },
): Promise<{ inserted: number }> {
  if (args.visionPageIds.length === 0) return { inserted: 0 }

  const rows = args.visionPageIds.map((id) => ({
    organization_id: args.organizationId,
    vision_page_id: id,
    reason: 'failed_index' as const,
  }))

  const { error, count } = await supabase
    .from('vision_review_queue')
    .insert(rows, { count: 'exact' })
  if (error) {
    console.warn('[vision/review-queue] enqueueFailedIndex failed:', error.message)
    return { inserted: 0 }
  }
  return { inserted: count ?? rows.length }
}

// ─── feedback ────────────────────────────────────────────────────────

export async function submitFeedback(
  supabase: SupabaseClient,
  payload: z.infer<typeof FeedbackSchema>,
): Promise<VisionFeedback> {
  const validated = FeedbackSchema.parse(payload)
  // Upsert so re-thumbing the same (user × query × page) replaces
  // the rating rather than creating a duplicate row.
  const { data, error } = await supabase
    .from('vision_feedback')
    .upsert(validated, { onConflict: 'user_id,search_query,vision_page_id' })
    .select('*')
    .single()
  if (error) throw new Error(`submitFeedback: ${error.message}`)
  return data as VisionFeedback
}

/**
 * Aggregate feedback for (org × query × page) — sum of ratings.
 * Positive = net thumbs-up; negative = net thumbs-down. Used by
 * the confidence calibrator (Sprint 8.8).
 */
export async function getFeedbackAggregate(
  supabase: SupabaseClient,
  orgId: string,
  searchQuery: string,
  visionPageId: string,
): Promise<{ totalRating: number; raterCount: number }> {
  const { data, error } = await supabase
    .from('vision_feedback')
    .select('rating')
    .eq('organization_id', orgId)
    .eq('search_query', searchQuery)
    .eq('vision_page_id', visionPageId)
  if (error) throw new Error(`getFeedbackAggregate: ${error.message}`)

  const rows = (data ?? []) as Array<{ rating: number }>
  const totalRating = rows.reduce((s, r) => s + r.rating, 0)
  return { totalRating, raterCount: rows.length }
}

export { parseJsonBody }
