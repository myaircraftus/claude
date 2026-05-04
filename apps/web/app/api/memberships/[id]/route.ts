/**
 * /api/memberships/[id]  (Spec 6.4)
 *
 *   PATCH  body { role?, persona?, action?: 'deactivate'|'reactivate' }
 *   DELETE — owner-only, removes the membership row entirely.
 *
 * Owner/admin only. Cannot demote the last owner. Cannot deactivate self.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot', 'viewer', 'auditor'])
const VALID_PERSONAS = new Set(['owner', 'mechanic', 'shop', 'admin'])

interface PatchBody {
  role?: string
  persona?: string | null
  action?: 'deactivate' | 'reactivate'
}

async function requireAdmin(supabase: ReturnType<typeof createServerSupabase>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const, user: null, caller: null }
  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id, role, user_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return { error: 'No org', status: 403 as const, user, caller: null }
  if (!['owner', 'admin'].includes(caller.role)) return { error: 'Owner/admin only', status: 403 as const, user, caller }
  return { error: null, status: 200 as const, user, caller }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const auth = await requireAdmin(supabase)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const caller = auth.caller!

  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Load target.
  const { data: target } = await supabase
    .from('organization_memberships')
    .select('id, user_id, role, organization_id')
    .eq('id', params.id)
    .eq('organization_id', caller.organization_id)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Self-deactivate guard.
  if (body.action === 'deactivate' && (target as { user_id: string }).user_id === caller.user_id) {
    return NextResponse.json({ error: "Can't deactivate yourself" }, { status: 400 })
  }
  // Last-owner-demote guard.
  if (body.role && body.role !== 'owner' && (target as { role: string }).role === 'owner') {
    const { count } = await supabase
      .from('organization_memberships').select('id', { count: 'exact', head: true })
      .eq('organization_id', caller.organization_id).eq('role', 'owner')
      .not('accepted_at', 'is', null).is('deactivated_at', null)
    if ((count ?? 0) <= 1) return NextResponse.json({ error: "Can't demote the last owner" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.role && VALID_ROLES.has(body.role)) patch.role = body.role
  if (body.persona !== undefined) {
    patch.persona = body.persona && VALID_PERSONAS.has(body.persona) ? body.persona : null
  }
  if (body.action === 'deactivate') {
    patch.deactivated_at = new Date().toISOString()
    patch.accepted_at = null
  } else if (body.action === 'reactivate') {
    patch.deactivated_at = null
    patch.accepted_at = new Date().toISOString()
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('organization_memberships').update(patch).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ membership: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const auth = await requireAdmin(supabase)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const caller = auth.caller!
  if (caller.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 })

  const { error } = await supabase
    .from('organization_memberships').delete()
    .eq('id', params.id).eq('organization_id', caller.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
