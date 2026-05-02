/**
 * POST /api/time-off-requests/[id]/decide
 *      Body: { decision: 'approved' | 'denied', manager_comment?: string }
 *
 * Owner/admin only. Stamps decided_by + decided_at and flips status.
 * Refuses to decide a request that's already been decided (idempotent guard).
 *
 * Spec 2.5.2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { TimeOffRequest } from '@/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only owner/admin can decide' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    decision?: unknown
    manager_comment?: unknown
  }
  const decision = body.decision === 'approved' || body.decision === 'denied' ? body.decision : null
  if (!decision) {
    return NextResponse.json({ error: "decision must be 'approved' or 'denied'" }, { status: 400 })
  }
  const managerComment = typeof body.manager_comment === 'string' ? body.manager_comment.slice(0, 1000) : null

  const supabase = createServerSupabase()

  // Atomic transition: only flip rows still in 'pending'. Two concurrent
  // approvals → one wins, the other gets zero-rows-affected → 409.
  const { data, error } = await supabase
    .from('time_off_requests')
    .update({
      status: decision,
      manager_comment: managerComment,
      decided_by: ctx.user.id,
      decided_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'Request is no longer pending or does not exist' },
      { status: 409 },
    )
  }
  return NextResponse.json({ request: data as TimeOffRequest })
}
