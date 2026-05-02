/**
 * POST /api/me/active-org
 *
 * Switches the user's active organization by writing the
 * active_organization_id + active_organization_slug cookies. Verifies the
 * user actually has an accepted membership for the target org first — no
 * cookie-stuffing.
 *
 * Body: { organization_id: string }
 *
 * Response:
 *   200 → { ok: true, active_organization_id, slug }
 *   401 → not signed in
 *   403 → user has no accepted membership for that org
 *   400 → bad payload
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { ORG_COOKIE_NAMES } from '@/lib/org/context'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { organization_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const targetOrgId = (body.organization_id ?? '').trim()
  if (!targetOrgId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 })
  }

  // Verify user has an accepted membership for the target org (no cookie-stuffing).
  const { data: membership, error } = await supabase
    .from('organization_memberships')
    .select('id, organization_id, organizations:organization_id (id, slug)')
    .eq('user_id', user.id)
    .eq('organization_id', targetOrgId)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!membership) {
    return NextResponse.json(
      { error: 'No accepted membership for that organization' },
      { status: 403 },
    )
  }

  const org = Array.isArray((membership as any).organizations)
    ? (membership as any).organizations[0]
    : (membership as any).organizations
  const slug: string | null = org?.slug ?? null

  // Set the active-org cookies. We also clear active_location_id so the
  // user starts in "all locations" mode after switching.
  const res = NextResponse.json({
    ok: true,
    active_organization_id: targetOrgId,
    slug,
  })
  const oneYear = 60 * 60 * 24 * 365
  res.cookies.set(ORG_COOKIE_NAMES.id, targetOrgId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: oneYear,
  })
  if (slug) {
    res.cookies.set(ORG_COOKIE_NAMES.slug, slug, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: oneYear,
    })
  }
  // Reset active location on org switch — different orgs have different locations.
  res.cookies.set(ORG_COOKIE_NAMES.location, '', {
    path: '/',
    maxAge: 0,
  })
  return res
}
