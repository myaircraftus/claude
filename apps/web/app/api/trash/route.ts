/**
 * /api/trash  (Cross-cutting Concern 4)
 *
 *   GET   → list deleted_at-not-null rows across all registered entity types
 *   POST   { entity_type, id, action: 'restore' | 'purge' } — flip deleted_at=null OR hard delete
 *
 * Mechanic+ for restore; owner/admin for permanent purge.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { TRASH_ENTITIES, type TrashEntityType } from '@/lib/trash/registry'

export const dynamic = 'force-dynamic'

const RESTORE_ROLES = new Set(['owner', 'admin', 'mechanic'])
const PURGE_ROLES = new Set(['owner', 'admin'])

interface ActionBody {
  entity_type?: string
  id?: string
  action?: 'restore' | 'purge'
}

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  // Fan out across registered entity types in parallel.
  const queries = Object.entries(TRASH_ENTITIES).map(async ([key, cfg]) => {
    const { data } = await supabase
      .from(cfg.table)
      .select(`id, ${cfg.display_field}, deleted_at`)
      .eq('organization_id', membership.organization_id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(50)
    return {
      entity_type: key,
      label: cfg.label,
      rows: ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        display: (r[cfg.display_field] as string | null) ?? '(unnamed)',
        deleted_at: r.deleted_at as string,
      })),
    }
  })
  const groups = await Promise.all(queries)
  return NextResponse.json({
    groups: groups.filter((g) => g.rows.length > 0),
    total: groups.reduce((s, g) => s + g.rows.length, 0),
  })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  let body: ActionBody
  try { body = (await req.json()) as ActionBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.entity_type || !(body.entity_type in TRASH_ENTITIES)) {
    return NextResponse.json({ error: 'Unknown entity_type' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (body.action !== 'restore' && body.action !== 'purge') {
    return NextResponse.json({ error: 'action must be restore or purge' }, { status: 400 })
  }
  if (body.action === 'restore' && !RESTORE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  if (body.action === 'purge' && !PURGE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  const cfg = TRASH_ENTITIES[body.entity_type as TrashEntityType]
  if (body.action === 'restore') {
    const { error } = await supabase
      .from(cfg.table)
      .update({ deleted_at: null })
      .eq('organization_id', membership.organization_id)
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, action: 'restore' })
  }

  // purge — hard delete
  const { error } = await supabase
    .from(cfg.table)
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('id', body.id)
    .not('deleted_at', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: 'purge' })
}
