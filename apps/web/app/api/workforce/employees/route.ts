/**
 * SOP-WRK-001 §10 — Team / employee-profile API.
 *
 *   PATCH { user_id, ...workforce fields } — upsert a workforce_employee_profile
 *
 * Admin-only (SOP §4 — "Manage team / permissions" is admin). Every change
 * writes a workforce_audit_events row.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'

type WorkforceRole = 'admin' | 'manager' | 'mechanic' | 'payroll_admin' | 'auditor'

const WORKFORCE_ROLES: WorkforceRole[] = ['admin', 'manager', 'mechanic', 'payroll_admin', 'auditor']
const EMPLOYMENT_STATUSES = ['active', 'inactive', 'on_leave']
const EMPLOYMENT_TYPES = ['hourly', 'salary', 'contractor']

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

export async function PATCH(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reqCtx = await resolveRequestOrgContext(req)
  if (!reqCtx) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const orgId = reqCtx.organizationId
  const service = createServiceSupabase()
  const role = await resolveWorkforceRole(service, orgId, user.id, reqCtx.role)

  // SOP §4 — only the admin workforce role manages team members.
  if (role !== 'admin') {
    return NextResponse.json(
      { error: 'Only a workforce admin can manage team members.' },
      { status: 403 },
    )
  }

  let body: {
    user_id?: string
    employee_code?: string | null
    role_title?: string | null
    department?: string | null
    employment_status?: string
    employment_type?: string
    workforce_role?: string
    hourly_rate_cents?: number | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  // Validate constrained fields.
  if (body.workforce_role && !WORKFORCE_ROLES.includes(body.workforce_role as WorkforceRole)) {
    return NextResponse.json({ error: 'Invalid workforce_role' }, { status: 422 })
  }
  if (body.employment_status && !EMPLOYMENT_STATUSES.includes(body.employment_status)) {
    return NextResponse.json({ error: 'Invalid employment_status' }, { status: 422 })
  }
  if (body.employment_type && !EMPLOYMENT_TYPES.includes(body.employment_type)) {
    return NextResponse.json({ error: 'Invalid employment_type' }, { status: 422 })
  }

  // The target must be an accepted member of this org.
  const { data: targetMembership } = await service
    .from('organization_memberships')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', body.user_id)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (!targetMembership) {
    return NextResponse.json({ error: 'That user is not a member of this organization.' }, { status: 404 })
  }

  const { data: before } = await service
    .from('workforce_employee_profiles')
    .select('*')
    .eq('organization_id', orgId)
    .eq('user_id', body.user_id)
    .maybeSingle()

  const patch: Record<string, unknown> = {
    organization_id: orgId,
    user_id: body.user_id,
  }
  if (body.employee_code !== undefined) patch.employee_code = body.employee_code
  if (body.role_title !== undefined) patch.role_title = body.role_title
  if (body.department !== undefined) patch.department = body.department
  if (body.employment_status) patch.employment_status = body.employment_status
  if (body.employment_type) patch.employment_type = body.employment_type
  if (body.workforce_role) patch.workforce_role = body.workforce_role
  if (body.hourly_rate_cents !== undefined) patch.hourly_rate_cents = body.hourly_rate_cents

  const { data: saved, error } = await service
    .from('workforce_employee_profiles')
    .upsert(patch, { onConflict: 'organization_id,user_id' })
    .select('*')
    .single()

  if (error || !saved) {
    return NextResponse.json({ error: 'Failed to save employee profile' }, { status: 500 })
  }

  await service.from('workforce_audit_events').insert({
    organization_id: orgId,
    actor_user_id: user.id,
    entity_type: 'employee',
    entity_id: saved.id,
    action: before ? 'update' : 'create',
    before_json: before ?? null,
    after_json: saved,
    reason: null,
  })

  return NextResponse.json({ ok: true })
}
