/**
 * POST /api/documents/review-requests — Phase 14 Sprint 14.4.
 *
 * Records a customer's choice of human-review type (Expert A&P,
 * Standard QA, or Skip) for a single document. v1 contract: workflow
 * only, no charge — humanReviewBillingEnabled() gates Stripe wiring
 * (default off until v2).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'
import {
  estimateReviewCost,
  humanReviewBillingEnabled,
} from '@/lib/billing/pricing-config'

const Body = z.object({
  documentId: safeUuid,
  organizationId: safeUuid,
  reviewType: z.enum(['expert_ap', 'standard_qa', 'skip']),
  estimatedHours: z.number().nonnegative().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response

  // Verify the user belongs to the org. RLS on document_review_requests
  // already enforces this on INSERT, but we check here to give a clean
  // 403 instead of an opaque RLS denial.
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', parsed.data.organizationId)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json(
      { error: 'You are not a member of this organization.' },
      { status: 403 },
    )
  }

  // Translate reviewType → cost estimate. Skip stores no cost.
  const costRecord =
    parsed.data.reviewType === 'expert_ap'
      ? estimateReviewCost('expertAp', parsed.data.estimatedHours ?? 0)
      : parsed.data.reviewType === 'standard_qa'
        ? estimateReviewCost('standardQa', parsed.data.estimatedHours ?? 0)
        : { hours: 0, rate: 0, total: 0 }

  // Service client bypasses RLS for the INSERT; we already auth'd above.
  const service = createServiceSupabase()
  const { data: row, error } = await (service as any)
    .from('document_review_requests')
    .insert({
      document_id: parsed.data.documentId,
      organization_id: parsed.data.organizationId,
      requested_by_user_id: user.id,
      review_type: parsed.data.reviewType,
      estimated_hours: costRecord.hours,
      hourly_rate_cents: costRecord.rate * 100,
      estimated_cost_cents: costRecord.total * 100,
      status: 'requested',
    })
    .select('id, review_type, estimated_hours, estimated_cost_cents')
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    id: row?.id,
    reviewType: row?.review_type,
    estimatedHours: row?.estimated_hours,
    estimatedCostCents: row?.estimated_cost_cents,
    /** v1: this is true. v2 launch flips it via env var. */
    chargedNow: humanReviewBillingEnabled() && parsed.data.reviewType !== 'skip',
  })
}
