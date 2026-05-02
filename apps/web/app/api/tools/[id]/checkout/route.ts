/**
 * POST /api/tools/[id]/checkout
 *      Body: { work_order_id?, notes? }
 *      Body { return_checkout_id, condition?, notes? } via DELETE-equivalent
 *      pattern; we use POST for "check out" and a separate /return endpoint
 *      for clarity.
 *
 * Spec 2.6.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkOutTool, assertToolCalibrated } from '@/lib/tools/queries'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { work_order_id?: unknown; notes?: unknown; force?: unknown }

  // Refuse check-out of an overdue tool (same calibration guard the WO
  // save uses). force=true override is admin-only.
  const supabase = createServerSupabase()
  const guard = await assertToolCalibrated(supabase, ctx.organizationId, params.id)
  if (!guard.ok) {
    const isAdmin = ['owner', 'admin'].includes(ctx.role)
    if (!body.force || !isAdmin) {
      return NextResponse.json({ error: guard.reason, tool: guard.tool }, { status: 409 })
    }
  }

  const result = await checkOutTool(supabase, {
    organizationId: ctx.organizationId,
    toolId: params.id,
    userId: ctx.user.id,
    workOrderId: typeof body.work_order_id === 'string' ? body.work_order_id : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })
  return NextResponse.json({ checkout: result.checkout }, { status: 201 })
}
