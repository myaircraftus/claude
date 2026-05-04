/**
 * GET /api/memberships  (Spec 6.4)
 *
 * Lists every membership in the active org with joined user_profile.
 * Org members read; admins write via the [id] subroute.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data: rows, error } = await supabase
    .from('organization_memberships')
    .select(`
      id, user_id, organization_id, role, persona, accepted_at, deactivated_at, invited_at,
      user_profiles!organization_memberships_user_id_fkey (id, email, full_name, avatar_url)
    `)
    .eq('organization_id', caller.organization_id)
    .order('invited_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    members: rows ?? [],
    can_manage: ['owner', 'admin'].includes(caller.role),
  })
}
