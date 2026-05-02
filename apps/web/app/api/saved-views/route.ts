/**
 * /api/saved-views (Spec 2.4)
 *
 * GET  → list saved views for the calling user (own + org-shared) in
 *        the active org. Filter by ?module to scope to one module.
 * POST → create a saved view. Body:
 *        {
 *          module, name, view_type, filters?, sort?, group_by?,
 *          display_config?, is_default?, scope?: 'me' | 'org'
 *        }
 *        scope='org' (user_id=NULL) requires owner+admin role.
 *        Setting is_default=true clears the prior default in the same
 *        scope (per-user or org-shared) for the same module.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, SavedViewType, SavedViewModule } from '@/types'

const VALID_VIEW_TYPES: ReadonlySet<SavedViewType> = new Set(['list', 'calendar', 'table', 'board'])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const module = url.searchParams.get('module') ?? undefined
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('saved_views')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (module) q = q.eq('module', module)
  // RLS handles user_id IS NULL OR user_id = auth.uid().

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ views: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const moduleKey = String(body?.module ?? '').trim()
  const name      = String(body?.name   ?? '').trim()
  if (!moduleKey) return NextResponse.json({ error: 'module required' }, { status: 400 })
  if (!name)      return NextResponse.json({ error: 'name required' },   { status: 400 })

  const viewType = body.view_type as SavedViewType
  if (!VALID_VIEW_TYPES.has(viewType)) {
    return NextResponse.json({ error: `view_type must be one of ${[...VALID_VIEW_TYPES].join(', ')}` }, { status: 400 })
  }

  const scope = body.scope === 'org' ? 'org' : 'me'
  if (scope === 'org' && !ADMIN_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Only owners and admins can create org-shared views' }, { status: 403 })
  }
  const userId: string | null = scope === 'org' ? null : ctx.user.id

  const isDefault = Boolean(body.is_default)
  const supabase = createServerSupabase()

  // If setting default, clear the prior default in the same scope.
  if (isDefault) {
    let clearQ = supabase
      .from('saved_views')
      .update({ is_default: false })
      .eq('organization_id', ctx.organizationId)
      .eq('module', moduleKey)
      .eq('is_default', true)
    clearQ = userId === null ? clearQ.is('user_id', null) : clearQ.eq('user_id', userId)
    await clearQ
  }

  const { data, error } = await supabase
    .from('saved_views')
    .insert({
      organization_id: ctx.organizationId,
      user_id: userId,
      module: moduleKey as SavedViewModule,
      name,
      view_type: viewType,
      filters: body.filters ?? {},
      sort: body.sort ?? null,
      group_by: body.group_by ?? null,
      display_config: body.display_config ?? {},
      is_default: isDefault,
    })
    .select('*')
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: `A view named "${name}" already exists for this module.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ view: data }, { status: 201 })
}
