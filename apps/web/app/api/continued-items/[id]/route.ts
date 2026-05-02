/**
 * /api/continued-items/[id] (Spec 1.4)
 *
 * GET    → single item.
 * PATCH  → update description / priority / status / notes /
 *          related_compliance_item / discovered_on_work_order.
 *          Setting status='completed' sets resolved_at if not already set
 *          (keeps the resolution metadata in sync). To set
 *          resolved_on_work_order with a confirmation prompt, use the
 *          dedicated POST /resolve endpoint.
 * DELETE → remove (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, ContinuedItemStatus, ContinuedItemPriority } from '@/types'

const VALID_STATUSES: ReadonlySet<ContinuedItemStatus> = new Set([
  'open', 'in-progress', 'completed', 'wont-fix',
])
const VALID_PRIORITIES: ReadonlySet<ContinuedItemPriority> = new Set([
  'low', 'medium', 'high', 'urgent',
])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('continued_items')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const updates: Record<string, unknown> = {}

  if (typeof body.description === 'string') {
    const trimmed = body.description.trim()
    if (!trimmed) return NextResponse.json({ error: 'description cannot be blank' }, { status: 400 })
    updates.description = trimmed
  }
  if (body.priority) {
    if (!VALID_PRIORITIES.has(body.priority)) {
      return NextResponse.json({ error: `priority must be one of ${[...VALID_PRIORITIES].join(', ')}` }, { status: 400 })
    }
    updates.priority = body.priority
  }
  if (body.status) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: `status must be one of ${[...VALID_STATUSES].join(', ')}` }, { status: 400 })
    }
    updates.status = body.status
    // Auto-stamp resolved_at when transitioning to completed/wont-fix and
    // it's not already set.
    if (body.status === 'completed' || body.status === 'wont-fix') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = ctx.user.id
    }
    // Re-opening clears the resolution stamps.
    if (body.status === 'open' || body.status === 'in-progress') {
      updates.resolved_at = null
      updates.resolved_by = null
      updates.resolved_on_work_order = null
    }
  }
  if ('notes' in body) updates.notes = body.notes ?? null
  if ('discovered_on_work_order' in body) updates.discovered_on_work_order = body.discovered_on_work_order ?? null
  if ('related_compliance_item' in body)  updates.related_compliance_item  = body.related_compliance_item  ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('continued_items')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('continued_items')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
