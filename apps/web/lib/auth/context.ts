import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import type { OrgRole } from '@/types'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'

interface OrganizationRecord {
  id: string
  slug?: string | null
  plan: string
  plan_queries_monthly: number
  queries_used_this_month: number
  queries_reset_at: string
  plan_storage_gb?: number
}

interface MembershipRecord {
  organization_id: string
  role: OrgRole
  organizations?: OrganizationRecord | OrganizationRecord[] | null
}

export interface RequestOrgContext {
  user: User
  organizationId: string
  role: OrgRole
  membership: MembershipRecord
  organization: OrganizationRecord | null
}

function getRequestedOrganizationId(req: NextRequest): string | null {
  return (
    req.headers.get('x-organization-id') ||
    req.headers.get('x-org-id') ||
    req.nextUrl.searchParams.get('org_id') ||
    req.cookies.get('active_organization_id')?.value ||
    req.cookies.get('organization_id')?.value ||
    null
  )
}

function getRequestedOrganizationSlug(req: NextRequest): string | null {
  return (
    req.headers.get('x-organization-slug') ||
    req.headers.get('x-org-slug') ||
    req.nextUrl.searchParams.get('org_slug') ||
    req.cookies.get('active_organization_slug')?.value ||
    null
  )
}

function normalizeOrganizationRecord(
  record: MembershipRecord['organizations']
): OrganizationRecord | null {
  if (!record) return null
  if (Array.isArray(record)) return (record[0] as OrganizationRecord | undefined) ?? null
  return record as OrganizationRecord
}

export async function resolveRequestOrgContext(
  req: NextRequest,
  options?: { includeOrganization?: boolean }
): Promise<RequestOrgContext | null> {
  const user = await getRequestUser(req)
  if (!user) return null

  const service = createServiceSupabase()
  const requestedOrgId = getRequestedOrganizationId(req)
  const requestedOrgSlug = getRequestedOrganizationSlug(req)
  const baseSelect = options?.includeOrganization
    || Boolean(requestedOrgSlug)
    ? `
      organization_id,
      role,
      organizations:organization_id (
        id,
        slug,
        plan,
        plan_queries_monthly,
        queries_used_this_month,
        queries_reset_at,
        plan_storage_gb
      )
    `
    : 'organization_id, role'

  let query = service
    .from('organization_memberships')
    .select(baseSelect)
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)

  if (requestedOrgId) {
    query = query.eq('organization_id', requestedOrgId)
  }

  const { data: memberships, error } = await query.limit(25)

  if (error || !memberships || memberships.length === 0) {
    return null
  }

  const typedMemberships = memberships as MembershipRecord[]

  const membership =
    typedMemberships.find((entry: MembershipRecord) => {
      if (!requestedOrgSlug) return false
      return normalizeOrganizationRecord(entry.organizations)?.slug === requestedOrgSlug
    }) ??
    typedMemberships[0]

  if (!membership) {
    return null
  }

  const membershipRecord = membership as MembershipRecord
  return {
    user,
    organizationId: membershipRecord.organization_id,
    role: membershipRecord.role,
    membership: membershipRecord,
    organization: normalizeOrganizationRecord(membershipRecord.organizations),
  }
}
