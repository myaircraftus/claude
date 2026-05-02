/**
 * /api/time-entries (Spec 2.3)
 *
 * GET  → list entries in active org. Filters: ?work_order_id, ?technician_id,
 *        ?status=open|closed, ?since (ISO date).
 * POST → clock-in (start a new entry for the calling user). Body:
 *        {
 *          work_order_id, work_order_line_id?, hourly_rate,
 *          work_type?, is_overtime?, notes?
 *        }
 *        Refuses if the user already has an open entry.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { clockIn } from '@/lib/timeclock/clock'
import type { OrgRole, TimeEntryWorkType } from '@/types'

const TIME_WRITE_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic', 'pilot'] as const
const VALID_WORK_TYPES: ReadonlySet<TimeEntryWorkType> = new Set(['labor', 'ojt', 'warranty', 'rework'])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const woId   = url.searchParams.get('work_order_id') ?? undefined
  const techId = url.searchParams.get('technician_id') ?? undefined
  const status = url.searchParams.get('status') ?? undefined  // 'open' | 'closed'
  const since  = url.searchParams.get('since') ?? undefined
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit    = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('time_entries')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('start_time', { ascending: false })
    .limit(limit)

  if (woId)   q = q.eq('work_order_id', woId)
  if (techId) q = q.eq('technician_id', techId)
  if (status === 'open')   q = q.is('end_time', null)
  if (status === 'closed') q = q.not('end_time', 'is', null)
  if (since) q = q.gte('start_time', since)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!TIME_WRITE_ROLES.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const workType = body.work_type && VALID_WORK_TYPES.has(body.work_type)
    ? (body.work_type as TimeEntryWorkType)
    : 'labor'

  const supabase = createServerSupabase()
  const result = await clockIn(supabase, ctx.organizationId, ctx.user.id, {
    work_order_id: String(body?.work_order_id ?? '').trim(),
    work_order_line_id: body?.work_order_line_id ?? null,
    hourly_rate: Number(body?.hourly_rate ?? 0),
    work_type: workType,
    is_overtime: Boolean(body?.is_overtime),
    notes: body?.notes ?? null,
  })

  if (!result.ok) {
    const status = result.error && /already clocked in/i.test(result.error) ? 409 : 400
    return NextResponse.json(
      { error: result.error || 'Clock-in failed', open_entry: result.entry },
      { status },
    )
  }
  return NextResponse.json({ entry: result.entry }, { status: 201 })
}
