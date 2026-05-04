/**
 * DELETE /api/invites/[id]  (Spec 6.5)
 *
 * Revokes a pending invite. Owner/admin only. Sets revoked_at; the
 * /accept endpoint refuses revoked tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
const WRITE_ROLES = new Set(['owner', 'admin'])

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(caller.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  const { error } = await supabase
    .from('organization_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', caller.organization_id)
    .is('accepted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
