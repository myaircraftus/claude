/**
 * GET    /api/clock-events/[id]   — read (any org member; RLS enforces org)
 * PATCH  /api/clock-events/[id]   — admin-only edit (e.g. fix stale "forgot to clock out")
 * DELETE /api/clock-events/[id]   — admin-only
 *
 * Spec 2.5.3. Break + clock-out flow lives at /break and /clock-out.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { ClockEvent } from '@/types'

const EDITABLE_FIELDS = ['notes', 'image_url', 'shift_id', 'clock_in_at', 'clock_out_at', 'status', 'breaks', 'total_hours'] as const

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('clock_events')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ event: data as ClockEvent })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only owner/admin can edit clock events' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) if (field in body) updates[field] = body[field]
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('clock_events')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data as ClockEvent })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Only owner/admin can delete' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('clock_events')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
