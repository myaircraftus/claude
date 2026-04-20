import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('organization_memberships')
    .select('user_id, role, user_profiles: user_id (id, full_name, email)')
    .eq('organization_id', context.organizationId)
    .not('accepted_at', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const members = (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    role: row.role,
    profile: row.user_profiles ?? null,
  }))

  return NextResponse.json({ members })
}
