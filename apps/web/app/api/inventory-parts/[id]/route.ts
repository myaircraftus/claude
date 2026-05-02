/**
 * /api/inventory-parts/[id] (Spec 2.1)
 *
 * GET    → single part.
 * PATCH  → update fields (mechanic+). qty_on_hand changes here are direct
 *          edits — for transactional changes use /consume or /restock so
 *          the low-stock cross-wire fires correctly.
 * DELETE → archive (default) or hard-delete with ?hard=1 (only allowed if
 *          no PO lines reference this part — RESTRICT FK on po_lines
 *          enforces).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, PartClass } from '@/types'

const VALID_CLASSES: ReadonlySet<PartClass> = new Set(['consumable', 'rotable', 'serialized'])

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('inventory_parts')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ part: data })
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

  if (typeof body.part_number === 'string') {
    const trimmed = body.part_number.trim()
    if (!trimmed) return NextResponse.json({ error: 'part_number cannot be blank' }, { status: 400 })
    updates.part_number = trimmed
  }
  if (typeof body.description === 'string') {
    const trimmed = body.description.trim()
    if (!trimmed) return NextResponse.json({ error: 'description cannot be blank' }, { status: 400 })
    updates.description = trimmed
  }
  if (Array.isArray(body.alt_part_numbers)) updates.alt_part_numbers = body.alt_part_numbers.map(String)
  if (Array.isArray(body.files))            updates.files            = body.files.map(String)
  if (Array.isArray(body.alert_emails))     updates.alert_emails     = body.alert_emails.map(String)
  if ('category' in body)  updates.category = body.category ?? null
  if ('vendor'   in body)  updates.vendor   = body.vendor   ?? null
  if ('location' in body)  updates.location = body.location ?? null
  if (body.part_class) {
    if (!VALID_CLASSES.has(body.part_class)) {
      return NextResponse.json({ error: 'invalid part_class' }, { status: 400 })
    }
    updates.part_class = body.part_class
  }
  for (const k of ['qty_on_hand', 'min_on_hand', 'unit_cost', 'unit_price'] as const) {
    if (k in body) {
      const n = Number(body[k])
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${k} must be a non-negative number` }, { status: 400 })
      }
      updates[k] = n
    }
  }
  if (typeof body.is_archived === 'boolean') updates.is_archived = body.is_archived

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('inventory_parts')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json(
        { error: 'A part with that part number already exists.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ part: data })
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
  const hard = req.nextUrl.searchParams.get('hard') === '1'

  if (hard) {
    const { error } = await supabase
      .from('inventory_parts')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    // RESTRICT on purchase_order_lines means any PO line referencing this
    // part will block the delete with a 23503 (foreign_key_violation).
    if (error) {
      if ((error as any).code === '23503') {
        return NextResponse.json(
          { error: 'Cannot hard-delete a part referenced by purchase orders. Archive instead.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('inventory_parts')
      .update({ is_archived: true })
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
