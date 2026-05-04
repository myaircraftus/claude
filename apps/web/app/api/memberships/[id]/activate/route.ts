/**
 * POST /api/memberships/[id]/activate  (Spec 6.1)
 *
 * Sets the active_organization_id cookie + slug from the membership's
 * org. Thin wrapper over the same logic /api/me/active-org uses (sprint
 * 0a). Caller verifies ownership of the membership.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm the membership belongs to the user AND is currently active.
  const { data: row } = await supabase
    .from('organization_memberships')
    .select('id, organization_id, role, organizations(slug)')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .is('deactivated_at', null)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Membership not active' }, { status: 404 })

  const orgRel = (row as { organizations?: { slug?: string | null } | { slug?: string | null }[] | null }).organizations
  const slug = Array.isArray(orgRel) ? orgRel[0]?.slug ?? null : orgRel?.slug ?? null
  const cookieStore = cookies()
  cookieStore.set('active_organization_id', (row as { organization_id: string }).organization_id, {
    httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  })
  if (slug) {
    cookieStore.set('active_organization_slug', slug, {
      httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    })
  }
  return NextResponse.json({ ok: true, organization_id: (row as { organization_id: string }).organization_id, slug })
}
