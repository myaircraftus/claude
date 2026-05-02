/**
 * POST /api/inventory-parts/[id]/restock (Spec 2.1)
 *
 * Increment qty_on_hand. Used for ad-hoc restocks not tied to a PO
 * (PO fulfillment uses /api/purchase-orders/[id]/fulfill which loops
 * through lines and calls restockInventoryPart directly).
 *
 * Body: { quantity: number, unit_cost_override?: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { restockInventoryPart } from '@/lib/inventory/consume'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

export async function POST(
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

  const quantity = Number(body?.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 })
  }

  const unit_cost_override =
    body?.unit_cost_override !== undefined && body.unit_cost_override !== null && body.unit_cost_override !== ''
      ? Number(body.unit_cost_override)
      : undefined

  const supabase = createServerSupabase()
  const result = await restockInventoryPart(
    supabase,
    ctx.organizationId,
    params.id,
    quantity,
    { unit_cost_override },
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Restock failed' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    part: result.part,
    qty_on_hand: result.qty_on_hand,
    cleared_low_stock: result.cleared_low_stock,
  })
}
