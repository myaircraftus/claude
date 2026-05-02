/**
 * /api/purchase-orders/[id] (Spec 2.1)
 *
 * GET    → single PO + lines (+ embedded part info for line rendering).
 * PATCH  → update header (vendor / status / dates / description / notes).
 *          Status is restricted: 'fulfilled' / 'partially-fulfilled' must
 *          go through /fulfill so the inventory increments fire.
 * DELETE → remove (mechanic+).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, PurchaseOrderStatus } from '@/types'

const VALID_STATUSES: ReadonlySet<PurchaseOrderStatus> = new Set([
  'draft', 'open-request', 'ordered', 'partially-fulfilled', 'fulfilled', 'cancelled',
])

const SELECT_PO = `
  id, organization_id, po_number, status, vendor, requested_by,
  requested_date, ordered_date, fulfilled_date, approximate_cost,
  description, receipt_urls, notes, created_at, updated_at,
  lines:purchase_order_lines (
    id, purchase_order_id, inventory_part_id, qty_ordered, qty_received,
    unit_cost, notes, sort_order, created_at, updated_at,
    part:inventory_parts (
      id, part_number, description, unit_cost, qty_on_hand, min_on_hand
    )
  )
`

function sortLines(po: any) {
  return {
    ...po,
    lines: Array.isArray(po?.lines)
      ? [...po.lines].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      : [],
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(SELECT_PO)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ purchase_order: sortLines(data) })
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
  if (typeof body.vendor === 'string')      updates.vendor      = body.vendor.trim()
  if ('description' in body)                updates.description = body.description ?? null
  if ('notes'       in body)                updates.notes       = body.notes       ?? null
  if ('ordered_date' in body)               updates.ordered_date = body.ordered_date ?? null
  if ('requested_date' in body)             updates.requested_date = body.requested_date ?? new Date().toISOString().slice(0,10)
  if (Array.isArray(body.receipt_urls))     updates.receipt_urls = body.receipt_urls.map(String)

  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    if (body.status === 'fulfilled' || body.status === 'partially-fulfilled') {
      return NextResponse.json(
        { error: "Use POST /api/purchase-orders/[id]/fulfill to mark fulfilled — it increments inventory." },
        { status: 400 },
      )
    }
    updates.status = body.status
    if (body.status === 'ordered') {
      updates.ordered_date = updates.ordered_date ?? new Date().toISOString().slice(0,10)
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ purchase_order: data })
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
    .from('purchase_orders')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
