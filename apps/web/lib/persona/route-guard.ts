/**
 * Phase 18 Sprint 18.4 — server-side persona route guards.
 *
 * Closes Phase 15 finding F2 ("persona-strict route guards bypassed")
 * which was deferred to v2 on 2026-05-09. The fix is twofold:
 *
 *   1. requirePersona(allowed, current) returns an allow/redirect decision
 *      that page Server Components can call inline:
 *
 *         const guard = await requirePersona(['shop', 'admin'])
 *         if (!guard.allowed) redirect(guard.redirectTo)
 *
 *   2. requirePersonaApi(allowed) returns 403 NextResponse for API routes.
 *
 * Effective persona resolution honors the optional view_as cookie that
 * platform admins set so they can preview a customer view without losing
 * admin access. View-as is enforced HERE — admins viewing as owner cannot
 * sneak into /scheduler.
 *
 * The redirect targets are persona-aware so the user lands somewhere
 * useful instead of an error page:
 *   - owner mismatch  → /my-aircraft (owner home)
 *   - shop mismatch   → /workflow    (shop home)
 *   - admin mismatch  → /admin/command-center (when current is admin
 *                                              but the route is not admin)
 *   - non-admin on admin route → owner/shop home depending on persona
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCurrentPersona } from './server'
import { PERSONA_CONFIG, isPersona } from './config'
import type { Persona } from '@/types'

/** Cookie name set by /api/persona/switch (Sprint 18.6) when an admin
 *  chooses to view-as another persona. */
export const VIEW_AS_COOKIE = 'mau_view_as_persona'

export interface GuardDecision {
  allowed: boolean
  /** Where to redirect when not allowed. Always populated when allowed=false. */
  redirectTo?: string
  /** The effective persona we made the decision on. Useful for logging. */
  effectivePersona: Persona
  /** Whether the effective persona came from a view_as cookie (admin only). */
  viewAs: boolean
}

/**
 * Read the effective persona for the current request. For non-admin users
 * this is identical to the true persona resolved by getCurrentPersona().
 * For admin users, a view-as cookie can override the effective persona so
 * admins can QA customer flows without re-signing-in.
 */
export async function getEffectivePersona(): Promise<{
  truePersona: Persona
  effectivePersona: Persona
  viewAs: boolean
}> {
  const { persona: truePersona } = await getCurrentPersona()
  const c = cookies()
  const raw = c.get(VIEW_AS_COOKIE)?.value
  // view-as only honored when the true persona is admin.
  if (truePersona === 'admin' && raw && isPersona(raw) && raw !== 'admin') {
    return { truePersona, effectivePersona: raw, viewAs: true }
  }
  return { truePersona, effectivePersona: truePersona, viewAs: false }
}

/**
 * Where should this persona land when bounced from a route they cannot
 * access? Always one of the canonical homeRoutes (Phase 14 + Phase 16).
 */
function homeRouteFor(persona: Persona): string {
  return PERSONA_CONFIG[persona].homeRoute
}

/**
 * Decide whether the current request is allowed on a route that requires
 * one of `allowed` personas. Server Component callers do:
 *
 *     const guard = await requirePersona(['shop', 'admin'])
 *     if (!guard.allowed) redirect(guard.redirectTo!)
 */
export async function requirePersona(
  allowed: ReadonlyArray<Persona>,
): Promise<GuardDecision> {
  const { effectivePersona, viewAs } = await getEffectivePersona()
  if (allowed.includes(effectivePersona)) {
    return { allowed: true, effectivePersona, viewAs }
  }
  return {
    allowed: false,
    effectivePersona,
    viewAs,
    redirectTo: homeRouteFor(effectivePersona),
  }
}

/**
 * API-route equivalent. Returns null if allowed, or a 403 NextResponse if
 * the request should be refused. Wires same view-as semantics.
 *
 *     const block = await requirePersonaApi(['admin'])
 *     if (block) return block
 */
export async function requirePersonaApi(
  allowed: ReadonlyArray<Persona>,
): Promise<NextResponse | null> {
  const { effectivePersona, viewAs } = await getEffectivePersona()
  if (allowed.includes(effectivePersona)) return null
  return NextResponse.json(
    {
      error: 'Forbidden — your persona cannot access this resource',
      effective_persona: effectivePersona,
      view_as: viewAs,
      required: allowed,
    },
    { status: 403 },
  )
}
