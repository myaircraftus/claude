/**
 * SOP-WRK-001 §4 — Workforce request context + role resolution.
 *
 * The Workforce Suite is shop-persona only (SOP §1). Within the shop persona,
 * five workforce roles gate features: admin, manager, mechanic, payroll_admin,
 * auditor. The role lives on workforce_employee_profiles.workforce_role.
 *
 * This is the ONLY way a /workforce page or API route should resolve access.
 * Permission checks are enforced server-side here — never trust the client.
 */
import { redirect } from 'next/navigation'
import { getCurrentOrg } from '@/lib/org/context'
import { getCurrentPersona } from '@/lib/persona/server'

export type WorkforceRole = 'admin' | 'manager' | 'mechanic' | 'payroll_admin' | 'auditor'

export interface WorkforceContext {
  supabase: Awaited<ReturnType<typeof getCurrentOrg>>['supabase']
  user: Awaited<ReturnType<typeof getCurrentOrg>>['user']
  profile: Awaited<ReturnType<typeof getCurrentOrg>>['profile']
  organizationId: string
  /** The workforce role driving feature access. */
  workforceRole: WorkforceRole
  /** The user's workforce_employee_profiles row, if one exists. */
  employeeProfile: Record<string, unknown> | null
  /** admin or manager — can schedule, approve, override. */
  isManagerPlus: boolean
  /** admin, manager, payroll_admin — may approve timesheets. */
  canApproveTimesheets: boolean
  /** admin or manager — may approve time off. */
  canApproveTimeOff: boolean
  /** admin, manager, payroll_admin, auditor — may open Reports. */
  canViewReports: boolean
  /** admin or payroll_admin — may export payroll. */
  canExportPayroll: boolean
  /** admin, payroll_admin, auditor — may view the audit trail. */
  canViewAudit: boolean
  /** admin only — may manage team members and permissions. */
  canManageTeam: boolean
  /** admin, manager, payroll_admin — may see restricted hourly-rate data. */
  canViewPayRates: boolean
}

/**
 * Resolve the Workforce context for the current request. Redirects owners
 * away (Workforce is shop-only). Falls back to an 'admin' workforce role for
 * org owner/admin members who have no workforce profile yet, and 'mechanic'
 * for everyone else — so a shop is never locked out before profiles exist.
 */
export async function getWorkforceContext(): Promise<WorkforceContext> {
  const { persona } = await getCurrentPersona()
  if (persona === 'owner') {
    // SOP §1 — Workforce is never visible to the owner persona.
    redirect('/dashboard')
  }

  const { supabase, user, profile, membership } = await getCurrentOrg()
  const organizationId = membership.organization_id

  // Resolve org-membership role + workforce profile explicitly (don't assume
  // the session membership object carries `role`).
  const [{ data: membershipRow }, { data: employeeProfile }] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('workforce_employee_profiles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const membershipRole = (membershipRow?.role as string | undefined) ?? 'mechanic'
  const fallbackRole: WorkforceRole = ['owner', 'admin'].includes(membershipRole)
    ? 'admin'
    : 'mechanic'
  const workforceRole = ((employeeProfile?.workforce_role as WorkforceRole | undefined) ??
    fallbackRole) as WorkforceRole

  const isManagerPlus = workforceRole === 'admin' || workforceRole === 'manager'

  return {
    supabase,
    user,
    profile,
    organizationId,
    workforceRole,
    employeeProfile: (employeeProfile as Record<string, unknown> | null) ?? null,
    isManagerPlus,
    canApproveTimesheets: isManagerPlus || workforceRole === 'payroll_admin',
    canApproveTimeOff: isManagerPlus,
    canViewReports:
      isManagerPlus || workforceRole === 'payroll_admin' || workforceRole === 'auditor',
    canExportPayroll: workforceRole === 'admin' || workforceRole === 'payroll_admin',
    canViewAudit:
      workforceRole === 'admin' ||
      workforceRole === 'payroll_admin' ||
      workforceRole === 'auditor',
    canManageTeam: workforceRole === 'admin',
    canViewPayRates:
      isManagerPlus || workforceRole === 'payroll_admin',
  }
}
