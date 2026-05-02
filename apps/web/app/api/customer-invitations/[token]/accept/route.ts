import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = (params.token ?? '').trim()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const { data: invite, error: findErr } = await service
    .from('customer_invitations')
    .select('id, invite_token, email, status, expires_at, invited_by_org_id, customer_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date()
  if (expired) return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
  if (!['pending', 'sent'].includes(invite.status)) {
    return NextResponse.json({ error: 'Invitation has already been consumed' }, { status: 409 })
  }

  // Defense-in-depth on top of the unguessable token: the authenticated user's
  // email must match the invited email. Prevents an intercepted token (e.g. a
  // forwarded invitation link) from being redeemed by a different account.
  const inviteEmail = invite.email?.trim().toLowerCase() ?? ''
  const userEmail = user.email?.trim().toLowerCase() ?? ''
  if (!inviteEmail || !userEmail || inviteEmail !== userEmail) {
    return NextResponse.json(
      { error: 'This invitation was sent to a different email address.' },
      { status: 403 },
    )
  }

  const { data: updated, error: updateErr } = await service
    .from('customer_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_user_id: user.id,
    })
    .eq('id', invite.id)
    .select('id, invite_token, customer_id, invited_by_org_id')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Link this customer record to the newly created user + flip portal_access on.
  if (updated.customer_id) {
    const { error: linkErr } = await service
      .from('customers')
      .update({ portal_user_id: user.id, portal_access: true })
      .eq('id', updated.customer_id)
    if (linkErr) {
      console.error('[customer-invitations.accept] customer link failed', linkErr)
    }
  }

  return NextResponse.json({ accepted: true, invitation_id: updated.id, invited_by_org_id: updated.invited_by_org_id })
}
