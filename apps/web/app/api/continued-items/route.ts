/**
 * /api/continued-items (Spec 1.4)
 *
 * GET  → list items in active org. Filter by ?aircraft_id, ?status (csv),
 *        ?work_order_id (matches discovered_on or resolved_on).
 *        Defaults to open + in-progress; pass ?status=all for everything.
 * POST → create a new continued item (mechanic+).
 *        Body: { aircraft_id, description, priority?, discovered_on_work_order?,
 *                discovered_date?, related_compliance_item?, notes? }
 *
 * Mechanic+ writes (matches RLS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ContinuedItemPriority, ContinuedItemStatus } from '@/types'

const VALID_STATUSES: ReadonlySet<ContinuedItemStatus> = new Set([
  'open', 'in-progress', 'completed', 'wont-fix',
])
const VALID_PRIORITIES: ReadonlySet<ContinuedItemPriority> = new Set([
  'low', 'medium', 'high', 'urgent',
])

const ACTIVE_DEFAULT: ContinuedItemStatus[] = ['open', 'in-progress']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const aircraftId  = url.searchParams.get('aircraft_id') ?? undefined
  const woId        = url.searchParams.get('work_order_id') ?? undefined
  const statusParam = url.searchParams.get('status') ?? undefined
  const limitRaw    = parseInt(url.searchParams.get('limit') ?? '200', 10)
  const limit       = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('continued_items')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    // Spec polish.cross-rollout — exclude soft-deleted rows.
    .is('deleted_at', null)
    // Order: priority desc (urgent first), then most-recently-discovered.
    // Postgres orders strings lexically; we sort by priority CASE on the
    // client (small lists) and use created_at as the primary ORDER BY.
    .order('discovered_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (aircraftId) q = q.eq('aircraft_id', aircraftId)
  if (woId) {
    // Match either discovered or resolved WO.
    q = q.or(`discovered_on_work_order.eq.${woId},resolved_on_work_order.eq.${woId}`)
  }
  if (statusParam) {
    if (statusParam === 'all') {
      // no filter
    } else {
      const wanted = statusParam
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is ContinuedItemStatus => VALID_STATUSES.has(s as ContinuedItemStatus))
      if (wanted.length > 0) q = q.in('status', wanted)
    }
  } else {
    q = q.in('status', ACTIVE_DEFAULT)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const aircraftId  = String(body?.aircraft_id ?? '').trim()
  const description = String(body?.description ?? '').trim()
  if (!aircraftId)  return NextResponse.json({ error: 'aircraft_id required' },  { status: 400 })
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  const priority: ContinuedItemPriority =
    body.priority && VALID_PRIORITIES.has(body.priority) ? body.priority : 'medium'

  const supabase = createServerSupabase()

  // Verify aircraft is in the active org. RLS would block; clean 404 is friendlier.
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found in this organization' }, { status: 404 })

  const discoveredDate =
    typeof body.discovered_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.discovered_date)
      ? body.discovered_date
      : new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('continued_items')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: aircraftId,
      description,
      discovered_on_work_order: body.discovered_on_work_order ?? null,
      discovered_date: discoveredDate,
      discovered_by: ctx.user.id,
      status: 'open',
      priority,
      related_compliance_item: body.related_compliance_item ?? null,
      notes: body.notes ?? null,
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data }, { status: 201 })
}
