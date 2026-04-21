import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, email, full_name, avatar_url, job_title, is_platform_admin')
      .eq('id', user.id)
      .single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data
  const membership = membershipRes.data

  return NextResponse.json({
    user,
    profile,
    membership,
    organization_id: membership?.organization_id ?? null,
    role: membership?.role ?? null,
  })
}
