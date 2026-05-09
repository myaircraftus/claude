/**
 * GET /api/vision/review        list pending review items (admin)
 * PATCH /api/vision/review/[id] mark a review item as reviewed
 *
 * Phase 8 Sprint 8.7. Owner/admin only. The PATCH handler lives in
 * the [id]/route.ts subfile.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { listReviewQueue } from '@/lib/vision/review-queue'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const rl = rateLimit(`vision-review-list:${getClientIp(req.headers)}`, { limit: 60, windowSeconds: 60 })
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

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const reason = url.searchParams.get('reason')

  const service = createServiceSupabase()
  const items = await listReviewQueue(service, membership.organization_id, {
    status: status as any,
    reason: reason as any,
  })
  return NextResponse.json({ items, total: items.length })
}
