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
  // For platform admins we use the view-as cookie (matches Sprint 18.4
  // semantics) so the admin keeps their underlying admin privileges
  // while previewing the customer surface.
  //
  // For non-admins we write user_profiles.persona so the switch survives
  // logout/session restore. Entitlement check guards against a shop user
  // forging an owner view they haven't paid for.
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

    // Durable preference. Use the same Supabase client that's already
    // bound to this request so RLS sees the right auth context.
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ persona: target })
      .eq('id', user.id)

    if (updateError) {
      console.error('[api/persona/switch] user_profiles update failed:', updateError)
      return NextResponse.json(
        { error: 'Failed to persist persona switch' },
        { status: 500 },
      )
    }

    // Clear any lingering view-as cookie — a non-admin's effective persona
    // should come from their profile row, not a cookie. Belt-and-braces.
    cookies().set(VIEW_AS_COOKIE, '', { maxAge: 0, path: '/' })

    return NextResponse.json({
      ok: true,
      persona: target,
      homeRoute: PERSONA_CONFIG[target].homeRoute,
      viewAs: false,
    })
  }

  // Platform admin → set view-as cookie (httpOnly so client JS can't forge it).
  cookies().set(VIEW_AS_COOKIE, target, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // Session-length cookie — admins typically don't want their view-as
    // selection to persist across days. Closing the tab resets to admin.
    maxAge: 60 * 60 * 12, // 12 hours
  })

  return NextResponse.json({
    ok: true,
    persona: target,
    homeRoute: PERSONA_CONFIG[target].homeRoute,
    viewAs: true,
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
