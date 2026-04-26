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

  // Users can have multiple memberships (e.g. owner of one org + mechanic at another).
  // Evaluate every accepted membership and surface the most-permissive entitlement so the
  // button reflects "user has access somewhere" rather than tying it to a single tenant.
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(25)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ allowed: false, reason: 'no_membership' }, { status: 200 })
  }

  const evaluations = await Promise.all(
    memberships.map((m) =>
      evaluateFaraimAccess(supabase, {
        userId: user.id,
        organizationId: m.organization_id,
      })
    )
  )

  // Pick the best entitlement: paid > trial > has_aircraft > free_quota > blocked.
  const priority: Record<string, number> = {
    paid: 5,
    trial: 4,
    has_aircraft: 3,
    free_quota: 2,
    trial_expired_no_aircraft: 1,
    free_quota_exhausted: 0,
  }
  const best = evaluations.reduce((acc, cur) =>
    (priority[cur.reason] ?? -1) > (priority[acc.reason] ?? -1) ? cur : acc
  )

  return NextResponse.json({
    allowed: best.allowed,
    reason: best.reason,
    remaining: best.remaining ?? null,
    upgradeRequired: best.upgradeRequired ?? false,
  })
}
