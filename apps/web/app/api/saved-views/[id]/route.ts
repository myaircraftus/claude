/**
 * /api/saved-views/[id] (Spec 2.4)
 *
 * GET    → single view.
 * PATCH  → update fields. user_id rules: owner of a personal view can
 *          edit their own; admins can edit org-shared views (user_id=NULL).
 *          RLS handles read; this endpoint handles the org-shared write
 *          gate explicitly.
 * DELETE → remove. Same rules as PATCH.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, SavedViewType } from '@/types'

const VALID_VIEW_TYPES: ReadonlySet<SavedViewType> = new Set(['list', 'calendar', 'table', 'board'])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('saved_views')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ view: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // Existence check + scope check
  const { data: existing } = await supabase
    .from('saved_views')
    .select('id, user_id, module')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const row = existing as { id: string; user_id: string | null; module: string }
  // Org-shared edit requires admin+
  if (row.user_id === null && !ADMIN_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Only owners and admins can edit org-shared views' }, { status: 403 })
  }
  // Personal-view edit must be the owner
  if (row.user_id !== null && row.user_id !== ctx.user.id) {
    return NextResponse.json({ error: 'You can only edit your own views' }, { status: 403 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body.name === 'string') {
    const trimmed = body.name.trim()
    if (!trimmed) return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 })
    updates.name = trimmed
  }
  if (body.view_type !== undefined) {
    if (!VALID_VIEW_TYPES.has(body.view_type)) {
      return NextResponse.json({ error: 'invalid view_type' }, { status: 400 })
    }
    updates.view_type = body.view_type
  }
  if ('filters'        in body) updates.filters        = body.filters        ?? {}
  if ('sort'           in body) updates.sort           = body.sort           ?? null
  if ('group_by'       in body) updates.group_by       = body.group_by       ?? null
  if ('display_config' in body) updates.display_config = body.display_config ?? {}
  if (typeof body.is_default === 'boolean') updates.is_default = body.is_default
  if (typeof body.sort_order === 'number')  updates.sort_order = body.sort_order

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // If flipping to default, clear the prior default in the same scope.
  if (updates.is_default === true) {
    let clearQ = supabase
      .from('saved_views')
      .update({ is_default: false })
      .eq('organization_id', ctx.organizationId)
      .eq('module', row.module)
      .eq('is_default', true)
      .neq('id', params.id)
    clearQ = row.user_id === null ? clearQ.is('user_id', null) : clearQ.eq('user_id', row.user_id)
    await clearQ
  }

  const { data, error } = await supabase
    .from('saved_views')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A view with that name already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ view: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: existing } = await supabase
    .from('saved_views')
    .select('id, user_id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const row = existing as { id: string; user_id: string | null }
  if (row.user_id === null && !ADMIN_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Only owners and admins can delete org-shared views' }, { status: 403 })
  }
  if (row.user_id !== null && row.user_id !== ctx.user.id) {
    return NextResponse.json({ error: 'You can only delete your own views' }, { status: 403 })
  }

  const { error } = await supabase
    .from('saved_views')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
