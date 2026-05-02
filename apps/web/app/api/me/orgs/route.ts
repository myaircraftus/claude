/**
 * GET /api/me/orgs
 *
 * Returns the current user's accepted memberships along with the active
 * organization id (read from the active_organization_id cookie / falls back
 * to the first membership) and the resolved active persona for that
 * (user, org) pair. Drives the org switcher + sidebar persona toggle.
 *
 * Response shape:
 *   {
 *     active_organization_id: string | null,
 *     active_location_id: string | null,
 *     active_persona: "owner" | "mechanic" | "shop",
 *     memberships: Array<{
 *       membership: OrganizationMembership,
 *       organization: { id, name, slug, org_type, home_base }
 *     }>
 *   }
 */

import { NextResponse } from 'next/server'
import { listUserMemberships, getCurrentOrg } from '@/lib/org/context'
import { getCurrentPersona } from '@/lib/persona/server'

export async function GET() {
  // getCurrentOrg() throws (redirect) if unauthenticated — callers from a
  // browser will receive the redirect; from fetch() it surfaces as an opaque
  // 307. The page layouts already enforce auth, so this only fires
  // post-login.
  const ctx = await getCurrentOrg()
  const [memberships, persona] = await Promise.all([
    listUserMemberships(),
    getCurrentPersona(),
  ])
  return NextResponse.json({
    active_organization_id: ctx.orgId,
    active_location_id: ctx.locationId,
    active_persona: persona.persona,
    active_persona_config: persona.config,
    memberships,
  })
}
