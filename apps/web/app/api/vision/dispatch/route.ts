/**
 * POST /api/vision/dispatch  (Phase 8 Sprint 8.3)
 *
 * Body: { jobId: uuid }
 *
 * Manually dispatch a queued vision_index_job (admin-driven).
 * Fire-and-forget via waitUntil so the HTTP response is immediate.
 *
 * Auth + rate limit mirror /api/vision/render: owner/admin only,
 * 5/min/IP.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { waitUntil } from '@vercel/functions'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody, safeUuid } from '@/lib/validation/common'
import { dispatchVisionJob } from '@/lib/vision/dispatcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const Body = z.object({
  jobId: safeUuid,
})

export async function POST(req: NextRequest) {
  const rl = rateLimit(`vision-dispatch:${getClientIp(req.headers)}`, { limit: 5, windowSeconds: 60 })
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

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response
  const { jobId } = parsed.data

  // Service-role for the actual work — same pattern as /api/vision/render.
  const service = createServiceSupabase()
  waitUntil((async () => {
    try {
      await dispatchVisionJob(service, jobId, membership.organization_id)
    } catch (err) {
      console.warn('[vision/dispatch] dispatch failed for', jobId, err)
    }
  })())

  return NextResponse.json({ ok: true, job_id: jobId, queued: true })
}
