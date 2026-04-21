import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

/**
 * GET /api/team
 *
 * Returns all members of the authenticated user's active organization,
 * including the authenticated user themselves. Roles are authoritative — they
 * come from organization_memberships in the DB — so the client can derive
 * real permissions rather than falling back to a hardcoded all-access default.
 */
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

  const rows = (data ?? []) as Array<{
    user_id: string
    role: string
    user_profiles?: { id: string; full_name?: string | null; email?: string | null } | null
  }>

  const members = rows.map((row) => ({
    user_id: row.user_id,
    role: row.role,
    profile: row.user_profiles ?? null,
    is_current_user: row.user_id === context.user.id,
  }))

  // Safety net: if for some reason the membership list does not include the
  // current user (e.g. stale join result), synthesize an entry from their
  // actual DB-verified role so the client never has to invent permissions.
  if (!members.some((m) => m.is_current_user)) {
    members.push({
      user_id: context.user.id,
      role: context.role,
      profile: {
        id: context.user.id,
        full_name: (context.user.user_metadata?.full_name as string | undefined) ?? null,
        email: context.user.email ?? null,
      },
      is_current_user: true,
    })
  }

  return NextResponse.json({
    members,
    current_user: {
      id: context.user.id,
      role: context.role,
      organization_id: context.organizationId,
    },
  })
}
