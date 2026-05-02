/**
 * POST /api/me/active-location
 *
 * Switches the active location filter (within the active org). Writes the
 * `active_location_id` cookie. Pass `{ location_id: null }` (or omit) to clear
 * the filter and view all locations.
 *
 * Verifies the location belongs to the user's active org. Cookie scope is
 * the whole site — the next page render reads it via getCurrentOrg().
 *
 * Body: { location_id: string | null }
 *
 * Response: 200 { ok, active_location_id } | 400 | 403 | 404
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentOrg, ORG_COOKIE_NAMES } from '@/lib/org/context'

export async function POST(req: NextRequest) {
  const ctx = await getCurrentOrg()

  let body: { location_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const targetLocationId = body.location_id ? String(body.location_id).trim() : null

  // Clearing the filter — wipe the cookie.
  if (!targetLocationId) {
    const res = NextResponse.json({ ok: true, active_location_id: null })
    res.cookies.set(ORG_COOKIE_NAMES.location, '', { path: '/', maxAge: 0 })
    return res
  }

  // Verify the location actually belongs to the active org.
  const supabase = createServerSupabase()
  const { data: loc, error } = await supabase
    .from('locations')
    .select('id, organization_id')
    .eq('id', targetLocationId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!loc) return NextResponse.json({ error: 'Location not found in active org' }, { status: 404 })

  const res = NextResponse.json({ ok: true, active_location_id: targetLocationId })
  res.cookies.set(ORG_COOKIE_NAMES.location, targetLocationId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
