/**
 * GET  /api/time-off-requests
 *      ?status=pending|approved|denied|cancelled  (repeatable)
 *      ?employee_id=UUID
 *      ?from=YYYY-MM-DD&to=YYYY-MM-DD             (overlap window)
 *      ?scope=mine                                 (current user only)
 *
 * POST /api/time-off-requests
 *      Body: { request_type, start_date, end_date, reason?, notify_user_ids? }
 *      Employee can submit for self; admin can submit on behalf via employee_id override.
 *
 * Spec 2.5.2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import type { TimeOffRequest, TimeOffStatus, TimeOffType } from '@/types'

const ALLOWED_STATUSES: TimeOffStatus[] = ['draft', 'pending', 'approved', 'denied', 'cancelled']
const ALLOWED_TYPES: TimeOffType[] = ['Holiday', 'Medical', 'Personal', 'Bereavement', 'Jury Duty']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)

  let query = supabase
    .from('time_off_requests')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('start_date', { ascending: false })
    .limit(300)

  const statuses = searchParams.getAll('status').filter((s): s is TimeOffStatus =>
    (ALLOWED_STATUSES as string[]).includes(s),
  )
  if (statuses.length > 0) query = query.in('status', statuses)

  const employeeId = searchParams.get('employee_id')
  if (employeeId) query = query.eq('employee_id', employeeId)

  if (searchParams.get('scope') === 'mine') query = query.eq('employee_id', ctx.user.id)

  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (from) query = query.gte('end_date', from)
  if (to) query = query.lte('start_date', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: (data ?? []) as TimeOffRequest[] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as Partial<TimeOffRequest> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const requestType = typeof body.request_type === 'string' ? body.request_type : ''
  if (!(ALLOWED_TYPES as string[]).includes(requestType)) {
    return NextResponse.json({ error: 'Invalid request_type' }, { status: 400 })
  }

  const startDate = typeof body.start_date === 'string' ? body.start_date : ''
  const endDate = typeof body.end_date === 'string' ? body.end_date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'start_date / end_date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: 'end_date must be on/after start_date' }, { status: 400 })
  }

  // Admin can submit on behalf via employee_id; otherwise self only.
  const isAdmin = ['owner', 'admin'].includes(ctx.role)
  const employeeId = (isAdmin && typeof body.employee_id === 'string' && body.employee_id)
    ? body.employee_id
    : ctx.user.id

  const notifyUserIds = Array.isArray(body.notify_user_ids)
    ? body.notify_user_ids.filter((u): u is string => typeof u === 'string').slice(0, 32)
    : []

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('time_off_requests')
    .insert({
      organization_id: ctx.organizationId,
      employee_id: employeeId,
      request_type: requestType,
      start_date: startDate,
      end_date: endDate,
      status: body.status === 'draft' ? 'draft' : 'pending',
      notify_user_ids: notifyUserIds,
      reason: typeof body.reason === 'string' ? body.reason : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data as TimeOffRequest }, { status: 201 })
}
