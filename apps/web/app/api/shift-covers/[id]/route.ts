/**
 * PATCH /api/shift-covers/[id]
 *
 * Three transitions supported:
 *   - open → claimed         (any active org member sets covering_tech_id = themselves)
 *   - claimed → approved     (owner/admin approves; the original Shift's
 *                             technician_id flips to covering_tech_id +
 *                             status='swapped')
 *   - claimed|open → rejected (owner/admin rejects; cover request closes)
 *
 * Spec 2.5.1: claimShiftCover() helper handles the open→claimed transition.
 *
 * DELETE /api/shift-covers/[id]
 *   Requester (or admin) withdraws the request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { claimShiftCover } from '@/lib/scheduler/queries'
import type { ShiftCover } from '@/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { status?: unknown }
  const targetStatus = typeof body.status === 'string' ? body.status : ''

  const supabase = createServerSupabase()
  const { data: existing } = await supabase
    .from('shift_covers')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const cover = existing as ShiftCover

  // ── open → claimed ──────────────────────────────────────────
  if (targetStatus === 'claimed') {
    if (cover.requested_by === ctx.user.id) {
      return NextResponse.json(
        { error: "You can't cover your own request" },
        { status: 409 },
      )
    }
    try {
      const claimed = await claimShiftCover(supabase, {
        coverId: cover.id,
        coveringTechId: ctx.user.id,
      })
      return NextResponse.json({ cover: claimed })
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 409 })
    }
  }

  // ── claimed → approved ──────────────────────────────────────
  if (targetStatus === 'approved') {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only owner/admin can approve' }, { status: 403 })
    }
    if (cover.status !== 'claimed' || !cover.covering_tech_id) {
      return NextResponse.json(
        { error: 'Cover must be claimed (with a covering tech) before approval' },
        { status: 409 },
      )
    }
    // Two-write transaction: flip the cover, AND reassign the shift +
    // mark it 'swapped'. Supabase JS doesn't expose Pg transactions
    // directly; we do them sequentially and rely on RLS to keep both
    // writes scoped to the same org.
    const { data: updated, error: updateErr } = await supabase
      .from('shift_covers')
      .update({ status: 'approved' })
      .eq('id', cover.id)
      .select('*')
      .single()
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    const { error: shiftErr } = await supabase
      .from('shifts')
      .update({ technician_id: cover.covering_tech_id, status: 'swapped' })
      .eq('id', cover.original_shift_id)
      .eq('organization_id', ctx.organizationId)
    if (shiftErr) {
      // Best-effort rollback of the cover row so the system isn't half-flipped.
      await supabase
        .from('shift_covers')
        .update({ status: 'claimed' })
        .eq('id', cover.id)
      return NextResponse.json({ error: shiftErr.message }, { status: 500 })
    }
    return NextResponse.json({ cover: updated as ShiftCover })
  }

  // ── claimed|open → rejected ─────────────────────────────────
  if (targetStatus === 'rejected') {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Only owner/admin can reject' }, { status: 403 })
    }
    const { data: updated, error } = await supabase
      .from('shift_covers')
      .update({ status: 'rejected' })
      .eq('id', cover.id)
      .select('*')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ cover: updated as ShiftCover })
  }

  return NextResponse.json(
    { error: 'Invalid target status. Allowed: claimed, approved, rejected.' },
    { status: 400 },
  )
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: existing } = await supabase
    .from('shift_covers')
    .select('id, requested_by')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  if (existing.requested_by !== ctx.user.id && !isAdmin) {
    return NextResponse.json(
      { error: 'Only the requester or owner/admin can withdraw' },
      { status: 403 },
    )
  }

  const { error } = await supabase
    .from('shift_covers')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
