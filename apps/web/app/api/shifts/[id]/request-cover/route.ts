/**
 * POST /api/shifts/[id]/request-cover
 *
 * Tech says "I can't make this shift, anyone willing to cover?"
 * Creates a shift_covers row with status='open'. The DB partial-UNIQUE
 * on (original_shift_id) WHERE status IN ('open','claimed') prevents
 * duplicate live requests; this surfaces as 23505 → we map to 409.
 *
 * Body: { reason?: string }
 *
 * Spec 2.5.1: requestShiftCover() helper.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { requestShiftCover } from '@/lib/scheduler/queries'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { reason?: unknown }
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null

  const supabase = createServerSupabase()

  // Confirm the shift exists, belongs to this org, and the requester
  // is its current assignee. Owner/admin can also request on behalf of
  // a tech (covers cases where the tech is sick + can't open the app).
  const { data: shift } = await supabase
    .from('shifts')
    .select('id, technician_id, status')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const isAssignee = shift.technician_id === ctx.user.id
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  if (!isAssignee && !isAdmin) {
    return NextResponse.json(
      { error: 'Only the shift assignee (or owner/admin) can request cover' },
      { status: 403 },
    )
  }

  if (shift.status === 'completed' || shift.status === 'missed' || shift.status === 'swapped') {
    return NextResponse.json(
      { error: `Can't request cover for a ${shift.status} shift` },
      { status: 409 },
    )
  }

  try {
    const cover = await requestShiftCover(supabase, {
      organizationId: ctx.organizationId,
      shiftId: params.id,
      requestedBy: shift.technician_id,
      reason,
    })
    return NextResponse.json({ cover }, { status: 201 })
  } catch (err: any) {
    // 23505 unique_violation — the partial-UNIQUE rejected because an
    // open/claimed cover already exists for this shift.
    if (err?.code === '23505') {
      return NextResponse.json(
        { error: 'This shift already has an open cover request' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}
