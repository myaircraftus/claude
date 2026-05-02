/**
 * POST /api/inventory-parts/[id]/consume (Spec 2.1)
 *
 * Decrement qty_on_hand by `quantity`. Goes through the shared
 * lib/inventory/consume.ts helper so the low-stock cross-wire fires
 * uniformly regardless of caller (manual UI consume, future WO-line
 * install hook, AI tool handler).
 *
 * Body: { quantity: number, source_kind?: string, source_id?: string }
 *
 * Mechanic+ only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { consumeInventoryPart } from '@/lib/inventory/consume'
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

  const supabase = createServerSupabase()
  const result = await consumeInventoryPart(
    supabase,
    ctx.organizationId,
    ctx.user.id,
    params.id,
    quantity,
    {
      source_kind: typeof body.source_kind === 'string' ? body.source_kind : undefined,
      source_id:   typeof body.source_id   === 'string' ? body.source_id   : undefined,
    },
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Consume failed' }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    part: result.part,
    qty_on_hand: result.qty_on_hand,
    flipped_low_stock: result.flipped_low_stock,
    shortfall: result.shortfall,
  })
}
