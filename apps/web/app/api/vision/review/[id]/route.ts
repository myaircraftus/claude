/**
 * PATCH /api/vision/review/[id]  (Phase 8 Sprint 8.7)
 *
 * Mark a review-queue item with a terminal review status. Owner/admin
 * only. Body: { status: 'reviewed_ok' | 'reviewed_problem' | 'dismissed',
 *               reviewer_notes?: string | null }
 *
 * The state-machine guard inside markReviewed() enforces legal
 * transitions; illegal transitions return 400.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation/common'
import { markReviewed, getReviewItem, type ReviewStatus } from '@/lib/vision/review-queue'

export const dynamic = 'force-dynamic'

const PatchBody = z.object({
  status: z.enum(['reviewed_ok', 'reviewed_problem', 'dismissed', 'pending']),
  reviewer_notes: z.string().max(4000).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = rateLimit(`vision-review-patch:${getClientIp(req.headers)}`, {
    limit: 60, windowSeconds: 60,
  })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  // Validate UUID shape on id param.
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const parsed = await parseJsonBody(req, PatchBody)
  if (!parsed.ok) return parsed.response

  const service = createServiceSupabase()

  // Confirm item exists in this org first (gives a 404 instead of a
  // confusing "illegal transition" when the id is for another tenant).
  const existing = await getReviewItem(service, params.id, membership.organization_id)
  if (!existing) {
    return NextResponse.json({ error: 'Not found in this org' }, { status: 404 })
  }

  try {
    const updated = await markReviewed(service, params.id, membership.organization_id, {
      status: parsed.data.status as ReviewStatus,
      reviewerUserId: user.id,
      notes: parsed.data.reviewer_notes ?? null,
    })
    return NextResponse.json({ item: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('illegal transition')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
