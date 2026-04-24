import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = (params.token ?? '').trim()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const service = createServiceSupabase()
  const { data: invite, error } = await service
    .from('customer_invitations')
    .select('id, invite_token, email, name, status, expires_at, invited_by_org_id, invited_by_user_id, customer_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invite) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })

  const expired = invite.expires_at && new Date(invite.expires_at) < new Date()
  const consumable = !expired && ['pending', 'sent'].includes(invite.status)

  let orgName: string | null = null
  let inviterName: string | null = null
  if (invite.invited_by_org_id) {
    const { data: org } = await service
      .from('organizations')
      .select('name')
      .eq('id', invite.invited_by_org_id)
      .maybeSingle()
    orgName = org?.name ?? null
  }
  if (invite.invited_by_user_id) {
    const { data: u } = await service
      .from('user_profiles')
      .select('full_name')
      .eq('id', invite.invited_by_user_id)
      .maybeSingle()
    inviterName = u?.full_name ?? null
  }

  return NextResponse.json({
    invitation: {
      token: invite.invite_token,
      email: invite.email,
      name: invite.name,
      status: invite.status,
      expired: !!expired,
      consumable,
      expires_at: invite.expires_at,
      inviter_org_name: orgName,
      inviter_user_name: inviterName,
    },
  })
}
