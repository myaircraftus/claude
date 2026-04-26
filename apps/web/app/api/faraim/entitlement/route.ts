import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { evaluateFaraimAccess } from '@/lib/faraim/entitlement'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ allowed: false, reason: 'unauthenticated' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ allowed: false, reason: 'no_membership' }, { status: 200 })
  }

  const access = await evaluateFaraimAccess(supabase, {
    userId: user.id,
    organizationId: membership.organization_id,
  })

  return NextResponse.json({
    allowed: access.allowed,
    reason: access.reason,
    remaining: access.remaining ?? null,
    upgradeRequired: access.upgradeRequired ?? false,
  })
}
