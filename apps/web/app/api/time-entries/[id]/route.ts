/**
 * /api/time-entries/[id] (Spec 2.3)
 *
 * GET    → single entry.
 * PATCH  → edit fields. Technicians can edit their own; owners + admins
 *          can edit anyone's. RLS enforces. Useful for retroactive
 *          corrections (forgot to clock out, wrong WO, etc.).
 *          Body: any subset of {start_time, end_time, hourly_rate,
 *          work_type, is_overtime, notes, work_order_id, work_order_line_id}.
 *          Setting end_time on an open entry is the same as clock-out
 *          but bypasses the "your own entry only" guard in /stop.
 * DELETE → remove (mechanic+ for own; owner/admin for anyone).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { TimeEntryWorkType } from '@/types'

const VALID_WORK_TYPES: ReadonlySet<TimeEntryWorkType> = new Set(['labor', 'ojt', 'warranty', 'rework'])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if ('start_time' in body)        updates.start_time        = body.start_time
  if ('end_time'   in body)        updates.end_time          = body.end_time ?? null
  if ('hourly_rate' in body) {
    const n = Number(body.hourly_rate)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: 'hourly_rate must be a non-negative number' }, { status: 400 })
    }
    updates.hourly_rate = n
  }
  if (body.work_type) {
    if (!VALID_WORK_TYPES.has(body.work_type)) {
      return NextResponse.json({ error: `work_type must be one of ${[...VALID_WORK_TYPES].join(', ')}` }, { status: 400 })
    }
    updates.work_type = body.work_type
  }
  if (typeof body.is_overtime === 'boolean') updates.is_overtime         = body.is_overtime
  if ('notes' in body)                       updates.notes               = body.notes ?? null
  if ('work_order_id' in body)               updates.work_order_id       = body.work_order_id
  if ('work_order_line_id' in body)          updates.work_order_line_id  = body.work_order_line_id ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    // 23505 = open-entry partial UNIQUE collision (clock-in while another open)
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'Another open entry already exists for this technician — close it first.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
