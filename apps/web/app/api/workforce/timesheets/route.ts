/**
 * SOP-WRK-001 §8 — Timesheets API.
 *
 *   POST   { week_start }                 — mechanic submits OWN timesheet
 *   PATCH  { employee_id, week_start }     — manager/admin/payroll approves
 *   GET    ?week=YYYY-MM-DD&export=csv     — payroll CSV export
 *
 * Guardrails enforced server-side (SOP §14):
 *   #2 — a mechanic can never approve a timesheet (their own or anyone's).
 *   Every submit/approve writes a workforce_audit_events row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { computeWeekRollup, weekRange, mondayOf, round2 } from '@/lib/workforce/timesheets'

type WorkforceRole = 'admin' | 'manager' | 'mechanic' | 'payroll_admin' | 'auditor'

/** Resolve the caller's workforce role for an org (API-route variant). */
async function resolveWorkforceRole(
  service: ReturnType<typeof createServiceSupabase>,
  organizationId: string,
  userId: string,
  membershipRole: string,
): Promise<WorkforceRole> {
  const { data } = await service
    .from('workforce_employee_profiles')
    .select('workforce_role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.workforce_role) return data.workforce_role as WorkforceRole
  return ['owner', 'admin'].includes(membershipRole) ? 'admin' : 'mechanic'
}

async function writeAudit(
  service: ReturnType<typeof createServiceSupabase>,
  row: {
    organization_id: string
    actor_user_id: string
    entity_id: string
    action: string
    before_json?: unknown
    after_json?: unknown
    reason?: string | null
  },
) {
  await service.from('workforce_audit_events').insert({
    organization_id: row.organization_id,
    actor_user_id: row.actor_user_id,
    entity_type: 'timesheet',
    entity_id: row.entity_id,
    action: row.action,
    before_json: row.before_json ?? null,
    after_json: row.after_json ?? null,
    reason: row.reason ?? null,
  })
}

// ── POST — mechanic submits their own timesheet ─────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reqCtx = await resolveRequestOrgContext(req)
  if (!reqCtx) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  let body: { week_start?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const weekStart = mondayOf(body.week_start)
  const orgId = reqCtx.organizationId
  const service = createServiceSupabase()

  // A user submits only their OWN timesheet (SOP §8.4).
  const [rollup] = await computeWeekRollup(service, orgId, weekStart, user.id)
  const { weekEnd } = weekRange(weekStart)
  const hours = rollup ?? {
    regular_hours: 0, overtime_hours: 0, billable_hours: 0, non_billable_hours: 0,
  }

  const { data: upserted, error } = await service
    .from('workforce_timesheets')
    .upsert(
      {
        organization_id: orgId,
        employee_id: user.id,
        week_start: weekStart,
        week_end: weekEnd,
        regular_hours: round2(hours.regular_hours),
        overtime_hours: round2(hours.overtime_hours),
        billable_hours: round2(hours.billable_hours),
        non_billable_hours: round2(hours.non_billable_hours),
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,week_start' },
    )
    .select('id')
    .single()

  if (error || !upserted) {
    return NextResponse.json({ error: 'Failed to submit timesheet' }, { status: 500 })
  }

  await writeAudit(service, {
    organization_id: orgId,
    actor_user_id: user.id,
    entity_id: upserted.id,
    action: 'submit',
    after_json: { week_start: weekStart, status: 'submitted' },
  })
  return NextResponse.json({ ok: true, status: 'submitted' })
}

// ── PATCH — manager/admin/payroll approves a timesheet ──────────────────────
export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reqCtx = await resolveRequestOrgContext(req)
  if (!reqCtx) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  let body: { employee_id?: string; week_start?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.employee_id || !body.week_start) {
    return NextResponse.json({ error: 'employee_id and week_start required' }, { status: 400 })
  }
  const orgId = reqCtx.organizationId
  const service = createServiceSupabase()
  const role = await resolveWorkforceRole(service, orgId, user.id, reqCtx.role)

  // SOP §14 #2 — a mechanic can never approve a timesheet.
  if (!['admin', 'manager', 'payroll_admin'].includes(role)) {
    return NextResponse.json(
      { error: 'Your workforce role cannot approve timesheets.' },
      { status: 403 },
    )
  }
  // SOP §14 #2 — and nobody approves their own.
  if (body.employee_id === user.id) {
    return NextResponse.json(
      { error: 'You cannot approve your own timesheet.' },
      { status: 403 },
    )
  }

  const weekStart = mondayOf(body.week_start)
  const [rollup] = await computeWeekRollup(service, orgId, weekStart, body.employee_id)
  const { weekEnd } = weekRange(weekStart)
  const hours = rollup ?? {
    regular_hours: 0, overtime_hours: 0, billable_hours: 0, non_billable_hours: 0,
  }

  const { data: upserted, error } = await service
    .from('workforce_timesheets')
    .upsert(
      {
        organization_id: orgId,
        employee_id: body.employee_id,
        week_start: weekStart,
        week_end: weekEnd,
        regular_hours: round2(hours.regular_hours),
        overtime_hours: round2(hours.overtime_hours),
        billable_hours: round2(hours.billable_hours),
        non_billable_hours: round2(hours.non_billable_hours),
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,week_start' },
    )
    .select('id')
    .single()

  if (error || !upserted) {
    return NextResponse.json({ error: 'Failed to approve timesheet' }, { status: 500 })
  }

  await writeAudit(service, {
    organization_id: orgId,
    actor_user_id: user.id,
    entity_id: upserted.id,
    action: 'approve',
    after_json: { week_start: weekStart, employee_id: body.employee_id, status: 'approved' },
  })
  return NextResponse.json({ ok: true, status: 'approved' })
}

// ── GET — payroll CSV export ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reqCtx = await resolveRequestOrgContext(req)
  if (!reqCtx) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const orgId = reqCtx.organizationId
  const service = createServiceSupabase()
  const role = await resolveWorkforceRole(service, orgId, user.id, reqCtx.role)
  if (!['admin', 'manager', 'payroll_admin'].includes(role)) {
    return NextResponse.json({ error: 'Not permitted to export payroll.' }, { status: 403 })
  }

  const weekStart = mondayOf(req.nextUrl.searchParams.get('week') ?? undefined)
  const rollups = await computeWeekRollup(service, orgId, weekStart)

  const names = new Map<string, string>()
  if (rollups.length > 0) {
    const { data: profiles } = await service
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', rollups.map((r) => r.employee_id))
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      names.set(p.id, p.full_name || p.email || 'Employee')
    }
  }

  const header = 'Employee,Week Start,Regular Hours,Overtime Hours,Billable Hours,Non-Billable Hours\n'
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = rollups
    .map((r) =>
      [
        escape(names.get(r.employee_id) ?? 'Employee'),
        weekStart,
        round2(r.regular_hours),
        round2(r.overtime_hours),
        round2(r.billable_hours),
        round2(r.non_billable_hours),
      ].join(','),
    )
    .join('\n')

  return new NextResponse(header + lines + '\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="timesheets-${weekStart}.csv"`,
    },
  })
}
