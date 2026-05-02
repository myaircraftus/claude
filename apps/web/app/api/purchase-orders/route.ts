/**
 * /api/purchase-orders (Spec 2.1)
 *
 * GET  → list POs in active org. Filters: ?status (csv), ?vendor.
 * POST → create new PO + line items. Generates po_number server-side
 *        via lib/inventory/po-numbers.ts. Body:
 *        {
 *          vendor, requested_date?, description?, expires_at?,
 *          lines: Array<{ inventory_part_id, qty_ordered, unit_cost, notes? }>
 *        }
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { generatePoNumber } from '@/lib/inventory/po-numbers'
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
    unit_cost, notes, sort_order, created_at, updated_at
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

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const statusParam = url.searchParams.get('status') ?? undefined
  const vendor      = url.searchParams.get('vendor') ?? undefined
  const limitRaw    = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit       = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500)

  const supabase = createServerSupabase()
  let query = supabase
    .from('purchase_orders')
    .select(SELECT_PO)
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (statusParam) {
    const wanted = statusParam
      .split(',').map((s) => s.trim())
      .filter((s): s is PurchaseOrderStatus => VALID_STATUSES.has(s as PurchaseOrderStatus))
    if (wanted.length > 0) query = query.in('status', wanted)
  }
  if (vendor) query = query.eq('vendor', vendor)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ purchase_orders: ((data ?? []) as any[]).map(sortLines) })
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

  const vendor = String(body?.vendor ?? '').trim()
  if (!vendor) return NextResponse.json({ error: 'vendor required' }, { status: 400 })

  const lines = Array.isArray(body?.lines) ? body.lines : []
  if (lines.length === 0) {
    return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })
  }
  for (const li of lines) {
    if (!li?.inventory_part_id) {
      return NextResponse.json({ error: 'Each line needs inventory_part_id' }, { status: 400 })
    }
    const qty = Number(li.qty_ordered)
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'qty_ordered must be a positive number' }, { status: 400 })
    }
  }

  const supabase = createServerSupabase()

  // Validate every part belongs to this org (prevents cross-org PO line fraud).
  const partIds = Array.from(new Set(lines.map((l: any) => String(l.inventory_part_id))))
  const { data: parts, error: partsErr } = await supabase
    .from('inventory_parts')
    .select('id')
    .in('id', partIds)
    .eq('organization_id', ctx.organizationId)
  if (partsErr) return NextResponse.json({ error: partsErr.message }, { status: 500 })
  const partIdSet = new Set((parts ?? []).map((p: any) => p.id))
  for (const id of partIds) {
    if (!partIdSet.has(id as string)) {
      return NextResponse.json({ error: `inventory_part_id ${id} not found in this organization` }, { status: 400 })
    }
  }

  const approximateCost = lines.reduce(
    (s: number, l: any) => s + (Number(l.qty_ordered) || 0) * (Number(l.unit_cost) || 0),
    0,
  )

  // Generate the PO number server-side (org × year sequence).
  const poNumber = await generatePoNumber(supabase, ctx.organizationId)

  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .insert({
      organization_id: ctx.organizationId,
      po_number: poNumber,
      status: 'draft',
      vendor,
      requested_by: ctx.user.id,
      requested_date: body.requested_date ?? new Date().toISOString().slice(0, 10),
      approximate_cost: approximateCost,
      description: body.description ?? null,
      receipt_urls: Array.isArray(body.receipt_urls) ? body.receipt_urls.map(String) : [],
      notes: body.notes ?? null,
    })
    .select('*')
    .single()

  if (poErr) {
    if ((poErr as any).code === '23505') {
      return NextResponse.json(
        { error: 'PO number collision — please retry.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: poErr.message }, { status: 500 })
  }
  const poId = (po as { id: string }).id

  const lineRows = lines.map((l: any, i: number) => ({
    purchase_order_id: poId,
    inventory_part_id: String(l.inventory_part_id),
    qty_ordered: Number(l.qty_ordered),
    qty_received: 0,
    unit_cost: Number.isFinite(Number(l.unit_cost)) ? Number(l.unit_cost) : 0,
    notes: l.notes ?? null,
    sort_order: Number.isFinite(Number(l.sort_order)) ? Number(l.sort_order) : i,
  }))

  const { error: linesErr } = await supabase
    .from('purchase_order_lines')
    .insert(lineRows)
  if (linesErr) {
    await supabase.from('purchase_orders').delete().eq('id', poId)
    return NextResponse.json({ error: linesErr.message }, { status: 500 })
  }

  const { data: full } = await supabase
    .from('purchase_orders')
    .select(SELECT_PO)
    .eq('id', poId)
    .maybeSingle()

  return NextResponse.json({ purchase_order: full ? sortLines(full) : po }, { status: 201 })
}
