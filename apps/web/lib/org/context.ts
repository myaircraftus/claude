/**
 * Org context — server + client helpers for "which org is the user looking at
 * right now?" Required by Spec 0.1 hard rule #7: every list query must filter
 * by current org.
 *
 * Server side (already exists): requireAppServerSession() resolves the
 * membership.organization_id from the active_organization_id cookie / slug
 * cookie / header. We just expose typed accessors here so consumers don't
 * have to re-derive the org each time.
 *
 * Client side: useOrg() reads /api/me to get the active org + the user's
 * other memberships (so the switcher can render). The active org is changed
 * by POSTing to /api/me/active-org.
 */

import { cookies } from 'next/headers'
import { requireAppServerSession } from '@/lib/auth/server-app'
import type { Organization, OrganizationMembership } from '@/types'

const ACTIVE_ORG_COOKIE = 'active_organization_id'
const ACTIVE_ORG_SLUG_COOKIE = 'active_organization_slug'
const ACTIVE_LOCATION_COOKIE = 'active_location_id'

export const ORG_COOKIE_NAMES = {
  id: ACTIVE_ORG_COOKIE,
  slug: ACTIVE_ORG_SLUG_COOKIE,
  location: ACTIVE_LOCATION_COOKIE,
} as const

/**
 * Server-side accessor for the currently-active org context. Wraps
 * requireAppServerSession so callers can write `const org = await getCurrentOrg()`
 * without dealing with the membership shape.
 *
 * Throws (via redirect) if the user isn't authenticated or has no membership.
 */
export async function getCurrentOrg() {
  const session = await requireAppServerSession()
  const orgId = session.membership.organization_id
  const locationId = cookies().get(ACTIVE_LOCATION_COOKIE)?.value || null
  return {
    orgId,
    locationId,
    profile: session.profile,
    membership: session.membership,
    organization: session.organization,
    supabase: session.supabase,
    user: session.user,
  }
}

/**
 * Server-side: list every org the user belongs to. Used by the org switcher
 * page + the GET /api/me/orgs handler.
 */
export async function listUserMemberships(): Promise<
  Array<{ membership: OrganizationMembership; organization: Pick<Organization, 'id' | 'name' | 'slug' | 'org_type' | 'home_base'> }>
> {
  const { supabase, user } = await getCurrentOrg()
  const { data, error } = await supabase
    .from('organization_memberships')
    .select(
      `id, organization_id, user_id, role, persona, invited_at, accepted_at,
       organization:organization_id (id, name, slug, org_type, home_base)`,
    )
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .order('invited_at', { ascending: true })

  if (error || !data) return []

  return (data as any[]).map((row) => ({
    membership: {
      id: row.id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.role,
      persona: row.persona ?? null,
      invited_at: row.invited_at,
      accepted_at: row.accepted_at,
    },
    organization: Array.isArray(row.organization) ? row.organization[0] : row.organization,
  }))
}
