/**
 * POST /api/vision/feedback  (Phase 8 Sprint 8.7)
 *
 * Per-(query × page) thumbs-up/down/neutral feedback from end users.
 * Upserts on (user × query × page) so re-thumbing replaces the rating
 * rather than creating a duplicate row.
 *
 * Body: { search_query: string, vision_page_id: uuid, rating: -1|0|1 }
 *
 * Auth: any authenticated org member (RLS enforces own-org write).
 * Rate limit: 60 req/min/IP — cheap operation.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody, safeStr, safeUuid } from '@/lib/validation/common'
import { submitFeedback } from '@/lib/vision/review-queue'

export const dynamic = 'force-dynamic'

const Body = z.object({
  search_query: safeStr.max(2000),
  vision_page_id: safeUuid,
  rating: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
})

export async function POST(req: NextRequest) {
  const rl = rateLimit(`vision-feedback:${getClientIp(req.headers)}`, {
    limit: 60, windowSeconds: 60,
  })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response

  // Confirm the page belongs to the caller's org before recording
  // feedback. Prevents users from voting on pages in other tenants.
  const service = createServiceSupabase()
  const { data: page, error: pageErr } = await service
    .from('vision_pages')
    .select('id, organization_id')
    .eq('id', parsed.data.vision_page_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (pageErr) {
    return NextResponse.json({ error: 'Page lookup failed' }, { status: 500 })
  }
  if (!page || page.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: 'Page not in this org' }, { status: 403 })
  }

  try {
    const row = await submitFeedback(service, {
      organization_id: membership.organization_id,
      search_query: parsed.data.search_query,
      vision_page_id: parsed.data.vision_page_id,
      rating: parsed.data.rating,
      user_id: user.id,
    })
    return NextResponse.json({ feedback: row })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
