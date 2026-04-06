// GET /api/parts/orders/[id] — fetch order + events
// PATCH /api/parts/orders/[id] — update status/fields
// DELETE /api/parts/orders/[id] — cancel (owner/admin only via RLS)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { updateOrderRecord } from '@/lib/parts/orders'
import type { PartOrderStatus } from '@/lib/parts/types'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: order, error } = await supabase
    .from('part_order_records')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: events } = await supabase
    .from('part_order_events')
    .select('*')
    .eq('part_order_record_id', params.id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ order, events: events ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  try {
    await updateOrderRecord(supabase, {
      organizationId: membership.organization_id,
      userId: user.id,
      orderId: params.id,
      status: body.status as PartOrderStatus | undefined,
      vendorOrderReference: body.vendor_order_reference,
      internalNote: body.internal_note,
      shippedAt: body.shipped_at,
      deliveredAt: body.delivered_at,
      installedAt: body.installed_at,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing } = await supabase
    .from('part_order_records')
    .select('organization_id')
    .eq('id', params.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await (supabase as any)
    .from('part_order_records')
    .update({ status: 'cancelled' })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('part_order_events').insert({
    organization_id: existing.organization_id,
    part_order_record_id: params.id,
    user_id: user.id,
    event_type: 'cancelled',
    metadata_json: {},
  })

  return NextResponse.json({ ok: true })
}
