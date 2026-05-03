/**
 * POST /api/work-orders/[id]/audit  (Spec 5.5)
 *
 * Manual trigger for the AI Inspector. Mechanic+ only. Idempotent —
 * re-running on the same WO refreshes the existing dedupe-keyed card
 * rather than duplicating.
 *
 * The auto-fire path (on WO close) lives in /api/work-orders/[id]/route.ts
 * PATCH; this route is for forced re-audit after an operator fixes
 * findings and wants to verify the gaps closed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { auditWorkOrder } from '@/lib/ai/inspectors/wo-auditor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Verify WO belongs to this org before handing off to the auditor (which
  // uses the service client and could otherwise reach across orgs).
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const service = createServiceSupabase()
  try {
    const result = await auditWorkOrder(service, {
      work_order_id: params.id,
      organization_id: membership.organization_id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[wo-audit] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Audit failed' },
      { status: 500 },
    )
  }
}
