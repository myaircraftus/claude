import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { withTenantPrefix } from '@/lib/auth/tenant-routing'
import type { UserProfile } from '@/types'

interface OrganizationRecord {
  id: string
  slug?: string | null
}

interface MembershipRecord {
  organization_id: string
  role: string
  organizations?: OrganizationRecord | OrganizationRecord[] | null
}

function normalizeOrganizationRecord(
  value: MembershipRecord['organizations']
): OrganizationRecord | null {
  if (!value) return null
  if (Array.isArray(value)) return (value[0] as OrganizationRecord | undefined) ?? null
  return value as OrganizationRecord
}

function getRequestedOrganizationId(): string | null {
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

function getRequestedOrganizationSlug(): string | null {
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
  const headerStore = headers()
  return headerStore.get('x-request-pathname') || null
}

export async function requireAppServerSession() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const requestedOrgId = getRequestedOrganizationId()
  const requestedOrgSlug = getRequestedOrganizationSlug()
  const requestedPathname = getRequestedPathname()
  const tenantLoginHref = (() => {
    const pathname = withTenantPrefix(requestedPathname || '/dashboard', requestedOrgSlug)
    const params = new URLSearchParams()
    params.set('redirect', pathname)
    return `/login?${params.toString()}`
  })()
  const tenantOnboardingHref = withTenantPrefix('/onboarding', requestedOrgSlug)

  if (!user) redirect(tenantLoginHref)

  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(25),
  ])

  const profile = profileRes.data as UserProfile | null
  if (!profile) redirect(tenantLoginHref)

  const memberships = (membershipsRes.data ?? []) as MembershipRecord[]

  const membership =
    memberships.find((entry) => requestedOrgId && entry.organization_id === requestedOrgId) ??
    memberships.find((entry) => {
      if (!requestedOrgSlug) return false
      return normalizeOrganizationRecord(entry.organizations)?.slug === requestedOrgSlug
    }) ??
    memberships[0] ??
    null

  if (!membership) redirect(tenantOnboardingHref)

  return {
    supabase,
    user,
    profile,
    membership,
    organization: normalizeOrganizationRecord(membership.organizations),
  }
}
