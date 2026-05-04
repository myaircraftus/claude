/**
 * POST /api/invites/[id]/accept  (Spec 6.5)
 *
 * NOTE: the [id] route segment carries the invite's TOKEN, not its
 * UUID. Named [id] (not [token]) to avoid a Next.js slug-conflict with
 * sibling /api/invites/[id]/route.ts (DELETE on uuid). The two are
 * disambiguated by HTTP method + path depth.
 *
 * Caller must be authenticated (they signed up via the magic link
 * first); this consumes the token + creates the
 * organization_memberships row + flips the invite to accepted_at.
 *
 * Service-role inside the route — RLS would block the membership insert
 * since the user has no membership in the target org yet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const token = params.id // path-segment value is the magic-link token
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  const service = createServiceSupabase()
  const { data: invite } = await service
    .from('organization_invites')
    .select('id, organization_id, email, role, persona, expires_at, accepted_at, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })
  const inv = invite as {
    id: string; organization_id: string; email: string; role: string;
    persona: string | null; expires_at: string;
    accepted_at: string | null; revoked_at: string | null;
  }
  if (inv.accepted_at) return NextResponse.json({ error: 'Invite already accepted' }, { status: 410 })
  if (inv.revoked_at) return NextResponse.json({ error: 'Invite revoked' }, { status: 410 })
  if (Date.parse(inv.expires_at) < Date.now()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 })

  // Optional: verify the auth user's email matches the invite (case-insensitive).
  const userEmail = user.email?.toLowerCase()
  if (!userEmail || userEmail !== inv.email.toLowerCase()) {
    return NextResponse.json({ error: 'Invite was sent to a different email' }, { status: 403 })
  }

  // Idempotent: if a membership row already exists, just stamp accepted_at.
  const { data: existing } = await service
    .from('organization_memberships').select('id')
    .eq('organization_id', inv.organization_id).eq('user_id', user.id).maybeSingle()

  let membershipId: string
  if (existing) {
    membershipId = (existing as { id: string }).id
    await service
      .from('organization_memberships')
      .update({ role: inv.role, persona: inv.persona, accepted_at: new Date().toISOString(), deactivated_at: null })
      .eq('id', membershipId)
  } else {
    const { data: ins, error: insErr } = await service
      .from('organization_memberships')
      .insert({
        organization_id: inv.organization_id,
        user_id: user.id,
        role: inv.role,
        persona: inv.persona,
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      })
      .select('id').single()
    if (insErr || !ins) return NextResponse.json({ error: insErr?.message ?? 'Failed to create membership' }, { status: 500 })
    membershipId = (ins as { id: string }).id
  }

  await service
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: user.id })
    .eq('id', inv.id)

  return NextResponse.json({ ok: true, membership_id: membershipId, organization_id: inv.organization_id })
}
