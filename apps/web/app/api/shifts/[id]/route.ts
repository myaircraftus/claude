/**
 * GET    /api/shifts/[id]   — read a single shift (any org member)
 * PATCH  /api/shifts/[id]   — update (owner/admin)
 * DELETE /api/shifts/[id]   — delete (owner/admin)
 *
 * Spec 2.5.1.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Shift, ShiftStatus } from '@/types'

const ALLOWED_STATUSES: ShiftStatus[] = [
  'scheduled', 'in-progress', 'completed', 'missed', 'swapped',
]

const EDITABLE_FIELDS = [
  'name', 'technician_id', 'location_id', 'roles', 'start_time',
  'end_time', 'status', 'reminders', 'checklist', 'notes',
] as const

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ shift: data as Shift })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json(
      { error: 'Only owner/admin can edit shifts' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field]
  }

  if (typeof updates.status === 'string' &&
      !(ALLOWED_STATUSES as string[]).includes(updates.status as string)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (typeof updates.start_time === 'string' && typeof updates.end_time === 'string') {
    if (new Date(updates.end_time as string).getTime() <=
        new Date(updates.start_time as string).getTime()) {
      return NextResponse.json({ error: 'end_time must be after start_time' }, { status: 400 })
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('shifts')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ shift: data as Shift })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json(
      { error: 'Only owner/admin can delete shifts' },
      { status: 403 },
    )
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
