import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { attachToWorkOrder } from '@/lib/parts/orders'
import { canWriteParts } from '@/lib/parts/permissions'
import type { OrgRole } from '@/types'

const attachSchema = z.object({
  order_id: z.string().uuid(),
  work_order_id: z.string().uuid(),
  part_number: z.string().max(100).nullable().optional(),
  title: z.string().min(1).max(500),
  quantity: z.number().int().min(1).max(999).optional().default(1),
  unit_cost: z.number().nullable().optional(),
})

export async function POST(req: NextRequest) {
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

    const parsed = attachSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const success = await attachToWorkOrder({
      organizationId: membership.organization_id,
      userId: user.id,
      orderId: parsed.data.order_id,
      workOrderId: parsed.data.work_order_id,
      partNumber: parsed.data.part_number ?? null,
      title: parsed.data.title,
      quantity: parsed.data.quantity,
      unitCost: parsed.data.unit_cost ?? null,
    })

    if (!success) {
      return NextResponse.json({ error: 'Failed to attach part to work order' }, { status: 400 })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: membership.organization_id,
      user_id: user.id,
      action: 'part.attached_to_work_order',
      entity_type: 'atlas_order_record',
      entity_id: parsed.data.order_id as unknown as string,
      metadata_json: { work_order_id: parsed.data.work_order_id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/parts/attach-to-work-order] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
