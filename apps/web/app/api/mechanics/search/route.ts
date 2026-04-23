import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { escapeLike } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  if (!MECHANIC_AND_ABOVE.includes(ctx.role as any)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ mechanics: [] })

  // PostgREST reports "more than one relationship found" because multiple FKs
  // point at user_profiles from organization_memberships (user_id + maybe
  // invited_by). Do the two-step join manually to avoid the ambiguity.
  const safe = escapeLike(q)
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(20)

  if (error) {
    console.error('[mechanics/search] profile query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const userIds = (profiles ?? []).map((p) => p.id)
  if (userIds.length === 0) return NextResponse.json({ mechanics: [] })

  const { data: memberships, error: mErr } = await supabase
    .from('organization_memberships')
    .select('user_id, organization_id, role, accepted_at')
    .eq('organization_id', orgId)
    .in('user_id', userIds)
    .not('accepted_at', 'is', null)
    .in('role', ['mechanic', 'owner', 'admin'])

  if (mErr) {
    console.error('[mechanics/search] membership query error', mErr)
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  const membershipByUser = new Map((memberships ?? []).map((m) => [m.user_id, m]))
  const mechanics = (profiles ?? [])
    .filter((p) => membershipByUser.has(p.id))
    .map((p) => {
      const m = membershipByUser.get(p.id)!
      return {
        user_id: p.id,
        org_id: orgId,
        name: p.full_name ?? '',
        email: p.email ?? '',
        phone: '',
        role: m.role,
      }
    })

  return NextResponse.json({ mechanics })
}
