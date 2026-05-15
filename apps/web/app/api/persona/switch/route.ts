/**
 * Phase 18 Sprint 18.6 — server-side persona switch.
 *
 * Replaces the old soft-nav-only persona switcher with a durable
 * server action that:
 *   1. Validates the target persona is one the caller is entitled to.
 *   2. Persists the switch (admins → view_as cookie; non-admins →
 *      user_profiles.persona DB write).
 *   3. Returns the canonical homeRoute so the client can do a FULL
 *      page navigation (not a soft router.push) — guaranteeing the
 *      next request hits server-side guards with the fresh persona
 *      and a fully rebuilt RSC tree.
 *
 * Why a full-page nav: soft-nav (router.push) keeps the previous
 * RSC tree mounted while only swapping the page — so any cached
 * fetches keyed on the old persona, plus the sidebar's old persona
 * state, will linger until a hard reload. The session-vanishing
 * bug Andy reported was a direct consequence. The client should
 * call this endpoint and then `window.location.assign(homeRoute)`.
 *
 * Body: { persona: 'owner' | 'shop' | 'admin' }
 * Response: { ok: true, persona, homeRoute, viewAs? } | { error }
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getOrganizationBillingStatus } from '@/lib/billing/gate'
import { PERSONA_CONFIG, isPersona } from '@/lib/persona/config'
import { VIEW_AS_COOKIE } from '@/lib/persona/route-guard'
import type { Persona } from '@/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawTarget = (body as { persona?: unknown })?.persona
  if (!isPersona(rawTarget)) {
    return NextResponse.json(
      { error: 'persona must be one of owner | shop | admin' },
      { status: 400 },
    )
  }
  const target = rawTarget as Persona

  // Resolve session — redirects to /login if not authenticated.
  const { supabase, user, profile, membership } = await requireAppServerSession()
  const isPlatformAdmin = profile?.is_platform_admin === true

  // 1. Admin target: only platform admins may select 'admin'.
  if (target === 'admin') {
    if (!isPlatformAdmin) {
      return NextResponse.json(
        { error: 'Forbidden — admin persona is platform-staff only' },
        { status: 403 },
      )
    }
    // Clear any view-as cookie so the admin returns to their true admin view.
    cookies().set(VIEW_AS_COOKIE, '', { maxAge: 0, path: '/' })
    return NextResponse.json({
      ok: true,
      persona: 'admin' satisfies Persona,
      homeRoute: PERSONA_CONFIG.admin.homeRoute,
      viewAs: false,
    })
  }

  // 2. Owner / shop target.
  //
  // The switch writes organization_memberships.persona for the ACTIVE org —
  // that is the column resolvePersona() reads FIRST, so it is what actually
  // drives getCurrentPersona(), /api/me/orgs, the sidebar, and the route
  // guards.
  //
  // This applies to platform admins TOO. The pre-2026-05-15 design routed
  // admins down a separate view-as-cookie path, but getEffectivePersona()
  // only honors that cookie when the true persona resolves to 'admin' — and
  // an admin whose membership/profile persona columns are null resolves to
  // DEFAULT_PERSONA ('owner'), so the cookie was silently ignored and the
  // switch did nothing. Writing the membership column works uniformly.
  // Platform admins keep admin-console access via the is_platform_admin
  // footer link (AdminFooterLink), independent of persona.

  // Non-admins are entitlement-gated; admins are not (never billing-gated).
  if (!isPlatformAdmin) {
    const status = await getOrganizationBillingStatus(membership.organization_id)
    const entitlement = status[target]
    if (!entitlement?.canRead) {
      return NextResponse.json(
        {
          error: 'No active entitlement for the requested persona',
          persona: target,
          entitlement_state: entitlement?.state ?? 'none',
        },
        { status: 402 },
      )
    }
  }

  // PRIMARY write — organization_memberships.persona for the active org.
  // `.select()` so we can detect a silent RLS no-op (0 rows updated → the
  // switch would otherwise appear to succeed while changing nothing).
  const { data: updatedRows, error: membershipError } = await supabase
    .from('organization_memberships')
    .update({ persona: target })
    .eq('user_id', user.id)
    .eq('organization_id', membership.organization_id)
    .select('user_id')

  if (membershipError) {
    console.error('[api/persona/switch] organization_memberships update failed:', membershipError)
    return NextResponse.json(
      { error: 'Failed to persist persona switch' },
      { status: 500 },
    )
  }
  if (!updatedRows || updatedRows.length === 0) {
    console.error('[api/persona/switch] organization_memberships update matched 0 rows', {
      user: user.id,
      org: membership.organization_id,
    })
    return NextResponse.json(
      { error: 'Persona switch did not persist (no membership row updated)' },
      { status: 500 },
    )
  }

  // SECONDARY (fallback) write — user_profiles.persona. Best-effort; a
  // failure here never blocks the switch since the membership write above
  // is authoritative for the active org.
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ persona: target })
    .eq('id', user.id)
  if (profileError) {
    console.warn('[api/persona/switch] user_profiles fallback update failed (non-fatal):', profileError)
  }

  // Clear any lingering view-as cookie — the resolved persona now comes from
  // the membership row, so a stale cookie must not shadow it.
  cookies().set(VIEW_AS_COOKIE, '', { maxAge: 0, path: '/' })

  return NextResponse.json({
    ok: true,
    persona: target,
    homeRoute: PERSONA_CONFIG[target].homeRoute,
    viewAs: false,
  })
}

/**
 * GET /api/persona/switch — read-only diagnostic helper. Returns the caller's
 * effective and true personas plus the view-as cookie state. Useful for QA
 * (and for the persona switcher's defensive re-sync on mount).
 */
export async function GET() {
  const { profile } = await requireAppServerSession()
  const cookieValue = cookies().get(VIEW_AS_COOKIE)?.value ?? null
  return NextResponse.json({
    truePersona: profile?.persona ?? null,
    viewAsCookie: cookieValue,
    isPlatformAdmin: profile?.is_platform_admin === true,
  })
}
