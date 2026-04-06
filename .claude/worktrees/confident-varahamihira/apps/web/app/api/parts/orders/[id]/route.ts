import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { updateOrderRecord } from '@/lib/parts/orders'
import { canWriteParts } from '@/lib/parts/permissions'
import type { OrgRole } from '@/types'

const patchSchema = z.object({
  status: z.enum([
    'draft', 'clicked_out', 'marked_ordered', 'confirmed',
    'shipped', 'delivered', 'received', 'installed', 'cancelled',
  ]).optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  vendor_order_reference: z.string().max(200).nullable().optional(),
  internal_note: z.string().max(2000).nullable().optional(),
  expected_for_use: z.string().max(500).nullable().optional(),
  ordered_at: z.string().datetime().nullable().optional(),
  shipped_at: z.string().datetime().nullable().optional(),
  delivered_at: z.string().datetime().nullable().optional(),
  installed_at: z.string().datetime().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 404 })

    const { data: order, error } = await supabase
      .from('atlas_order_records')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (error || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Fetch events too
    const { data: events } = await supabase
      .from('atlas_order_events')
      .select('*')
      .eq('order_record_id', params.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({ ...order, events: events ?? [] })
  } catch (err) {
    console.error('[GET /api/parts/orders/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 404 })

    if (!canWriteParts(membership.role as OrgRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const updated = await updateOrderRecord({
      organizationId: membership.organization_id,
      userId: user.id,
      orderId: params.id,
      ...parsed.data,
      vendorOrderReference: parsed.data.vendor_order_reference,
      internalNote: parsed.data.internal_note,
      expectedForUse: parsed.data.expected_for_use,
      orderedAt: parsed.data.ordered_at,
      shippedAt: parsed.data.shipped_at,
      deliveredAt: parsed.data.delivered_at,
      installedAt: parsed.data.installed_at,
    })

    if (!updated) return NextResponse.json({ error: 'Order not found or update failed' }, { status: 404 })

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: membership.organization_id,
      user_id: user.id,
      action: 'part.order_updated',
      entity_type: 'atlas_order_record',
      entity_id: params.id as unknown as string,
      metadata_json: { changes: parsed.data },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PATCH /api/parts/orders/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
