/**
 * /api/me/persona — read + write the active persona for the current
 * (user, organization) pair.
 *
 * GET  → returns { persona, config, membership_persona, profile_persona }.
 *        The resolved `persona` honors the fallback chain
 *        membership → profile → DEFAULT_PERSONA.
 *
 * POST → updates organization_memberships.persona for the active org. If the
 *        user is in onboarding (no membership row yet), updates
 *        user_profiles.persona instead so the value persists into whatever
 *        membership gets created next. Body: { persona: "owner" | "mechanic"
 *        | "shop", scope?: "membership" | "profile" }.
 *
 * The /api/me/orgs response also embeds the resolved persona to save a
 * second round-trip on initial app load.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { isPersona, PERSONA_CONFIG } from '@/lib/persona/config'

export async function GET() {
  try {
    const { persona, config, membershipPersona, profilePersona } = await getCurrentPersona()
    return NextResponse.json({
      persona,
      config,
      membership_persona: membershipPersona,
      profile_persona: profilePersona,
    })
  } catch (e: any) {
    // getCurrentPersona() redirects on no-session via requireAppServerSession();
    // explicit 401 here is just for non-redirect callers (e.g. fetch from RSC).
    return NextResponse.json({ error: e?.message || 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { persona?: string; scope?: 'membership' | 'profile' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isPersona(body.persona)) {
    return NextResponse.json(
      { error: 'persona must be one of: owner, mechanic, shop' },
      { status: 400 },
    )
  }
  const persona = body.persona
  const scope = body.scope === 'profile' ? 'profile' : 'membership'

  if (scope === 'profile') {
    const { error } = await supabase
      .from('user_profiles')
      .update({ persona })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, persona, scope, config: PERSONA_CONFIG[persona] })
  }

  // Default scope: write to organization_memberships for the active org.
  // We re-derive the active org rather than trusting a body param so this
  // route can never be used to mutate a membership the user doesn't own.
  const cookieStore = req.cookies
  const activeOrgId =
    cookieStore.get('active_organization_id')?.value ||
    cookieStore.get('organization_id')?.value ||
    null

  // Find the right membership: prefer the cookie-selected org, else the
  // user's first accepted membership (matches requireAppServerSession()).
  const { data: memberships, error: mErr } = await supabase
    .from('organization_memberships')
    .select('id, organization_id, accepted_at')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .order('invited_at', { ascending: true })
    .limit(25)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  const target =
    (activeOrgId && memberships?.find((m) => m.organization_id === activeOrgId)) ||
    memberships?.[0] ||
    null
  if (!target) {
    // No membership yet → fall back to writing the profile so the value isn't lost.
    const { error } = await supabase
      .from('user_profiles')
      .update({ persona })
      .eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      persona,
      scope: 'profile',
      config: PERSONA_CONFIG[persona],
      note: 'Saved to user_profiles — no active membership yet.',
    })
  }

  const { error } = await supabase
    .from('organization_memberships')
    .update({ persona })
    .eq('id', target.id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    persona,
    scope: 'membership',
    organization_id: target.organization_id,
    config: PERSONA_CONFIG[persona],
  })
}
