import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { withTenantPrefix } from '@/lib/auth/tenant-routing'
import type { OrgRole } from '@/types'

interface OrganizationRecord {
  id: string
  slug?: string | null
}

interface MembershipRecord {
  organization_id: string
  role: OrgRole
  organizations?: OrganizationRecord | OrganizationRecord[] | null
}

function normalizeOrganizationRecord(
  value: MembershipRecord['organizations']
): OrganizationRecord | null {
  if (!value) return null
  if (Array.isArray(value)) return (value[0] as OrganizationRecord | undefined) ?? null
  return value as OrganizationRecord
}

function getRequestedOrgId(): string | null {
  const headerStore = headers()
  const cookieStore = cookies()
  return (
    headerStore.get('x-organization-id') ||
    headerStore.get('x-org-id') ||
    cookieStore.get('active_organization_id')?.value ||
    cookieStore.get('organization_id')?.value ||
    null
  )
}

function getRequestedOrgSlug(): string | null {
  const headerStore = headers()
  const cookieStore = cookies()
  return (
    headerStore.get('x-organization-slug') ||
    headerStore.get('x-org-slug') ||
    cookieStore.get('active_organization_slug')?.value ||
    null
  )
}

function getRequestedPathname(): string | null {
  return headers().get('x-request-pathname') || null
}

/**
 * Server-side role gate for App Router layouts/pages.
 *
 * Usage:
 *   ```ts
 *   export default async function AdminLayout({ children }) {
 *     await requireRole(ADMIN_AND_ABOVE)
 *     return <>{children}</>
 *   }
 *   ```
 *
 * If the user is not authenticated, they are redirected to /login.
 * If the user's role is not in `allowedRoles`, they are redirected to
 * /dashboard (tenant-aware).
 */
export async function requireRole(
  allowedRoles: readonly OrgRole[],
  options?: { redirectTo?: string }
): Promise<{ role: OrgRole; organizationId: string; userId: string }> {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const requestedOrgSlug = getRequestedOrgSlug()
  const requestedOrgId = getRequestedOrgId()
  const requestedPathname = getRequestedPathname()

  if (!user) {
    const loginParams = new URLSearchParams()
    loginParams.set('redirect', withTenantPrefix(requestedPathname || '/dashboard', requestedOrgSlug))
    redirect(`/login?${loginParams.toString()}`)
  }

  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(id, slug)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(25)

  const records = (memberships ?? []) as MembershipRecord[]

  const membership =
    records.find((entry) => requestedOrgId && entry.organization_id === requestedOrgId) ??
    records.find((entry) => {
      if (!requestedOrgSlug) return false
      return normalizeOrganizationRecord(entry.organizations)?.slug === requestedOrgSlug
    }) ??
    records[0] ??
    null

  if (!membership) {
    redirect(withTenantPrefix('/onboarding', requestedOrgSlug))
  }

  if (!allowedRoles.includes(membership.role)) {
    redirect(options?.redirectTo ?? withTenantPrefix('/dashboard', requestedOrgSlug))
  }

  return {
    role: membership.role,
    organizationId: membership.organization_id,
    userId: user.id,
  }
}
