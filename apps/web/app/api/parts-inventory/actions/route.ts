import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { isPartsAuditAction } from '@/lib/parts-inventory/workflow'
import type { OrgRole } from '@/types'

const EVENT_TYPE_BY_ACTION: Record<string, 'create' | 'update' | 'export' | 'status_change'> = {
  part_saved: 'create',
  part_added_to_inventory: 'create',
  inventory_adjusted: 'update',
  vendor_ai_reviewed: 'update',
  vendor_saved: 'create',
  purchase_order_created: 'create',
  rx_receipt_confirmed: 'status_change',
  return_created: 'create',
  analytics_exported: 'export',
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

  const action = body?.action
  if (!isPartsAuditAction(action)) {
    return NextResponse.json({ error: 'Unsupported Parts & Inventory action' }, { status: 400 })
  }

  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}
  const objectId = isUuid(payload.object_id) ? payload.object_id : randomUUID()
  const aircraftId = isUuid(payload.aircraft_id) ? payload.aircraft_id : null
  const supabase = createServerSupabase()

  const { error } = await supabase.from('audit_events').insert({
    organization_id: ctx.organizationId,
    actor_id: ctx.user.id,
    actor_name: ctx.user.email ?? null,
    event_type: EVENT_TYPE_BY_ACTION[action],
    object_type: String(payload.object_type ?? 'parts_inventory'),
    object_id: objectId,
    object_description: String(payload.description ?? action).slice(0, 240),
    metadata: {
      ...payload,
      action,
      source_module: 'parts_inventory',
      aircraft_id: aircraftId,
      review_required: Boolean(payload.review_required),
    },
    ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (aircraftId) {
    await supabase.from('aircraft_timeline_events').insert({
      organization_id: ctx.organizationId,
      aircraft_id: aircraftId,
      module: 'parts_inventory',
      action,
      source_record_type: String(payload.object_type ?? 'parts_inventory'),
      source_record_id: objectId,
      title: String(payload.timeline_title ?? 'Parts & Inventory action'),
      summary: String(payload.timeline_summary ?? payload.description ?? action),
      owner_visible: false,
      actor_id: ctx.user.id,
      metadata: { action, ...payload },
    })
  }

  return NextResponse.json({ ok: true, audit_object_id: objectId })
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
