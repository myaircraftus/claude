/**
 * Server-side persona resolver. Wraps `requireAppServerSession()` so callers
 * can write `const { persona, config } = await getCurrentPersona()` without
 * dealing with the membership/profile fallback themselves.
 *
 * Hard rule: this is the *only* way the server should read persona. Don't
 * read `membership.persona` directly — go through this helper so the
 * fallback chain (membership → profile → DEFAULT) is honored consistently.
 */

import { getCurrentOrg } from '@/lib/org/context'
import { PERSONA_CONFIG, resolvePersona, type PersonaConfig } from './config'
import type { Persona } from '@/types'

export interface ResolvedPersona {
  /** The persona that drives this user's UI for the active org. */
  persona: Persona
  /** Convenience accessor — same as PERSONA_CONFIG[persona]. */
  config: PersonaConfig
  /** Raw membership.persona before fallback. NULL means "inherit from profile". */
  membershipPersona: Persona | null
  /** Raw user_profiles.persona. NULL for users who never finished onboarding. */
  profilePersona: Persona | null
}

/**
 * Resolve the persona for the current request. Throws (via redirect) if the
 * user isn't authenticated or has no membership.
 */
export async function getCurrentPersona(): Promise<ResolvedPersona> {
  const { supabase, user, profile, membership } = await getCurrentOrg()

  // membership.persona: not part of the existing requireAppServerSession select,
  // so fetch it directly. Cheap — single column, single row.
  const { data: membershipRow } = await supabase
    .from('organization_memberships')
    .select('persona')
    .eq('organization_id', membership.organization_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const membershipPersona = membershipRow?.persona ?? null
  const profilePersona = profile.persona ?? null

  const persona = resolvePersona(membershipPersona, profilePersona)

  return {
    persona,
    config: PERSONA_CONFIG[persona],
    membershipPersona: membershipPersona as Persona | null,
    profilePersona: profilePersona as Persona | null,
  }
}
