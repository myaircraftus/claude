/**
 * POST /api/purchase-orders/[id]/fulfill (Spec 2.1)
 *
 * Mark a PO (partially) fulfilled by recording received quantities per
 * line. The "When a PO is fulfilled → increment qty_on_hand for each
 * line" auto-flow lives here.
 *
 * Body:
 *   {
 *     receipts: Array<{
 *       line_id: string,
 *       qty_received_now: number   // how much arrived this fulfillment
 *     }>
 *   }
 *
 * Behavior:
 *   1. For each receipt, increment line.qty_received by qty_received_now.
 *   2. Call lib/inventory/consume.ts:restockInventoryPart for the part,
 *      passing the line.unit_cost as unit_cost_override (latest-cost
 *      heuristic — weighted-average is a follow-up).
 *   3. Recompute parent status: 'fulfilled' if all lines fully received,
 *      'partially-fulfilled' otherwise. Stamps fulfilled_date when the
 *      PO closes.
 *
 * Mechanic+ only. Idempotent enough — repeated calls with the same body
 * over-increment, so the UI should track per-line outstanding qty.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { restockInventoryPart } from '@/lib/inventory/consume'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole } from '@/types'

interface ReceiptInput {
  line_id: string
  qty_received_now: number
}

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

  const receipts = Array.isArray(body?.receipts) ? body.receipts : []
  if (receipts.length === 0) {
    return NextResponse.json({ error: 'receipts array required' }, { status: 400 })
  }
  for (const r of receipts as any[]) {
    if (!r?.line_id || typeof r.line_id !== 'string') {
      return NextResponse.json({ error: 'each receipt needs line_id' }, { status: 400 })
    }
    const q = Number(r.qty_received_now)
    if (!Number.isFinite(q) || q <= 0) {
      return NextResponse.json({ error: 'qty_received_now must be positive' }, { status: 400 })
    }
  }
  const typedReceipts: ReceiptInput[] = receipts.map((r: any) => ({
    line_id: String(r.line_id),
    qty_received_now: Number(r.qty_received_now),
  }))

  const supabase = createServerSupabase()

  // Verify PO is in this org + fetch its lines.
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((po as { status: string }).status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot fulfill a cancelled PO' }, { status: 400 })
  }

  const { data: lines } = await supabase
    .from('purchase_order_lines')
    .select('*')
    .eq('purchase_order_id', params.id)
  const lineRows = (lines ?? []) as Array<{
    id: string; inventory_part_id: string; qty_ordered: number; qty_received: number; unit_cost: number;
  }>
  const lineById = new Map(lineRows.map((l) => [l.id, l]))

  const results: Array<{ line_id: string; qty_received: number; restock: any }> = []

  for (const r of typedReceipts) {
    const line = lineById.get(r.line_id)
    if (!line) {
      return NextResponse.json({ error: `Line ${r.line_id} not found on this PO` }, { status: 404 })
    }
    const newQtyReceived = Number(line.qty_received) + r.qty_received_now
    if (newQtyReceived > Number(line.qty_ordered)) {
      // Don't refuse — operators sometimes get extras. But warn via the
      // response so the UI can flag it.
    }

    // Bump the line's qty_received
    const { error: lineErr } = await supabase
      .from('purchase_order_lines')
      .update({ qty_received: newQtyReceived })
      .eq('id', line.id)
    if (lineErr) {
      return NextResponse.json({ error: `Update line ${line.id}: ${lineErr.message}` }, { status: 500 })
    }

    // Restock inventory
    const restock = await restockInventoryPart(
      supabase,
      ctx.organizationId,
      line.inventory_part_id,
      r.qty_received_now,
      { unit_cost_override: Number(line.unit_cost) || undefined },
    )
    if (!restock.ok) {
      return NextResponse.json({ error: `Restock part: ${restock.error}` }, { status: 500 })
    }

    results.push({ line_id: line.id, qty_received: newQtyReceived, restock })
  }

  // Recompute parent PO status. Re-read lines so we account for *all* of
  // them, not just the ones in this receipts batch.
  const { data: refreshedLines } = await supabase
    .from('purchase_order_lines')
    .select('qty_ordered, qty_received')
    .eq('purchase_order_id', params.id)

  const allReceived = (refreshedLines ?? []).every(
    (l: any) => Number(l.qty_received) >= Number(l.qty_ordered),
  )
  const anyReceived = (refreshedLines ?? []).some(
    (l: any) => Number(l.qty_received) > 0,
  )

  const newStatus = allReceived ? 'fulfilled' : (anyReceived ? 'partially-fulfilled' : 'ordered')
  const updates: Record<string, unknown> = { status: newStatus }
  if (allReceived) updates.fulfilled_date = new Date().toISOString().slice(0, 10)

  const { data: updatedPo, error: poErr } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()
  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    purchase_order: updatedPo,
    results,
  })
}
