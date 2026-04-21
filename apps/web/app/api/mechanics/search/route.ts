import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { escapeLike } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!MECHANIC_AND_ABOVE.includes(membership.role as any)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ mechanics: [] })

  // user_profiles has: id, email, full_name, avatar_url, job_title (no phone column)
  // Search across name + email only; escape the pattern to prevent LIKE injection.
  const safe = escapeLike(q)
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select(`
      id,
      full_name,
      email,
      organization_memberships!inner (
        organization_id,
        role,
        accepted_at
      )
    `)
    .not('organization_memberships.accepted_at', 'is', null)
    .in('organization_memberships.role', ['mechanic', 'owner', 'admin'])
    .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .limit(20)

  if (error) {
    console.error('[mechanics/search] query error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const mechanics = (profiles ?? []).map((p: any) => {
    const m = Array.isArray(p.organization_memberships)
      ? p.organization_memberships[0]
      : p.organization_memberships
    return {
      user_id: p.id,
      org_id: m?.organization_id ?? null,
      name: p.full_name ?? '',
      email: p.email ?? '',
      phone: '', // user_profiles does not currently store phone — placeholder
      role: m?.role ?? 'mechanic',
    }
  })

  return NextResponse.json({ mechanics })
}
