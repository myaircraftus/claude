// GET /api/parts/orders — list org's part orders with filters
// POST /api/parts/orders — create a manual (non-click) order record

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { listOrders } from '@/lib/parts/orders'
import type { PartOrderStatus } from '@/lib/parts/types'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id') ?? undefined
  const workOrderId = searchParams.get('work_order_id') ?? undefined
  const status = (searchParams.get('status') ?? undefined) as PartOrderStatus | undefined
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

  try {
    const orders = await listOrders(supabase, membership.organization_id, {
      aircraftId, workOrderId, status, limit,
    })
    return NextResponse.json({ orders })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()
  if (!body.title && !body.selected_title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const quantity = Math.max(1, Number(body.quantity ?? 1))
  const unitPrice = body.unit_price != null ? Number(body.unit_price) : null
  const shipping = body.shipping_price != null ? Number(body.shipping_price) : null
  const totalPrice = unitPrice != null ? unitPrice * quantity + (shipping ?? 0) : null

  const { data: record, error } = await (supabase as any)
    .from('part_order_records')
    .insert({
      organization_id: membership.organization_id,
      aircraft_id: body.aircraft_id ?? null,
      work_order_id: body.work_order_id ?? null,
      user_id: user.id,
      status: body.status ?? 'draft',
      quantity,
      unit_price: unitPrice,
      shipping_price: shipping,
      total_price: totalPrice,
      currency: body.currency ?? 'USD',
      vendor_name: body.vendor_name ?? null,
      vendor_url: body.vendor_url ?? null,
      vendor_order_reference: body.vendor_order_reference ?? null,
      internal_note: body.internal_note ?? null,
      selected_part_number: body.part_number ?? body.selected_part_number ?? null,
      selected_title: body.title ?? body.selected_title,
      selected_condition: body.condition ?? null,
      expected_for_use: body.expected_for_use ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('part_order_events').insert({
    organization_id: membership.organization_id,
    part_order_record_id: record.id,
    user_id: user.id,
    event_type: 'created',
    metadata_json: { manual: true },
  })

  return NextResponse.json(record, { status: 201 })
}
