import { createServerSupabase } from '@/lib/supabase/server'
import type { AtlasOrderRecord, PartOrderStatus } from './types'

interface CreateOrderRecordInput {
  organizationId: string
  userId: string
  searchId: string
  offerId: string
  aircraftId?: string | null
  workOrderId?: string | null
  quantity: number
  vendorName: string
  vendorUrl: string
  selectedPartNumber?: string | null
  selectedTitle: string
  selectedCondition?: string | null
  selectedImageUrl?: string | null
  unitPrice?: number | null
  shippingPrice?: number | null
  currency?: string | null
}

export async function createOrderRecord(input: CreateOrderRecordInput): Promise<AtlasOrderRecord | null> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('atlas_order_records')
    .insert({
      organization_id: input.organizationId,
      aircraft_id: input.aircraftId ?? null,
      work_order_id: input.workOrderId ?? null,
      part_search_id: input.searchId,
      part_offer_id: input.offerId,
      user_id: input.userId,
      status: 'clicked_out',
      quantity: input.quantity,
      unit_price: input.unitPrice ?? null,
      shipping_price: input.shippingPrice ?? null,
      total_price: input.unitPrice != null
        ? (input.unitPrice * input.quantity) + (input.shippingPrice ?? 0)
        : null,
      currency: input.currency ?? 'USD',
      vendor_name: input.vendorName,
      vendor_url: input.vendorUrl,
      selected_part_number: input.selectedPartNumber ?? null,
      selected_title: input.selectedTitle,
      selected_condition: input.selectedCondition ?? null,
      selected_image_url: input.selectedImageUrl ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[orders] createOrderRecord error', error)
    return null
  }

  // Write click-out event
  await supabase.from('atlas_order_events').insert({
    organization_id: input.organizationId,
    order_record_id: data.id,
    user_id: input.userId,
    event_type: 'clicked_out',
    metadata_json: {
      vendor: input.vendorName,
      offer_id: input.offerId,
      search_id: input.searchId,
    },
  })

  return data as AtlasOrderRecord
}

interface UpdateOrderInput {
  organizationId: string
  userId: string
  orderId: string
  status?: PartOrderStatus
  quantity?: number
  vendorOrderReference?: string | null
  internalNote?: string | null
  expectedForUse?: string | null
  orderedAt?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  installedAt?: string | null
}

export async function updateOrderRecord(input: UpdateOrderInput): Promise<AtlasOrderRecord | null> {
  const supabase = createServerSupabase()

  const updates: Record<string, unknown> = {}
  if (input.status !== undefined) updates.status = input.status
  if (input.quantity !== undefined) updates.quantity = input.quantity
  if (input.vendorOrderReference !== undefined) updates.vendor_order_reference = input.vendorOrderReference
  if (input.internalNote !== undefined) updates.internal_note = input.internalNote
  if (input.expectedForUse !== undefined) updates.expected_for_use = input.expectedForUse
  if (input.orderedAt !== undefined) updates.ordered_at = input.orderedAt
  if (input.shippedAt !== undefined) updates.shipped_at = input.shippedAt
  if (input.deliveredAt !== undefined) updates.delivered_at = input.deliveredAt
  if (input.installedAt !== undefined) updates.installed_at = input.installedAt

  const { data, error } = await supabase
    .from('atlas_order_records')
    .update(updates)
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .select()
    .single()

  if (error) {
    console.error('[orders] updateOrderRecord error', error)
    return null
  }

  // Append status change event
  if (input.status) {
    await supabase.from('atlas_order_events').insert({
      organization_id: input.organizationId,
      order_record_id: input.orderId,
      user_id: input.userId,
      event_type: 'status_changed',
      metadata_json: { new_status: input.status },
    })
  }

  return data as AtlasOrderRecord
}

interface AttachToWorkOrderInput {
  organizationId: string
  userId: string
  orderId: string
  workOrderId: string
  partNumber?: string | null
  title: string
  quantity: number
  unitCost?: number | null
}

export async function attachToWorkOrder(input: AttachToWorkOrderInput): Promise<boolean> {
  const supabase = createServerSupabase()

  // Verify the order belongs to this org
  const { data: order } = await supabase
    .from('atlas_order_records')
    .select('id, part_offer_id, organization_id')
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)
    .single()

  if (!order) return false

  // Update order record with work_order_id
  await supabase
    .from('atlas_order_records')
    .update({ work_order_id: input.workOrderId })
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)

  // Add a part line to work_order_lines
  const { error: lineError } = await supabase
    .from('work_order_lines')
    .insert({
      work_order_id: input.workOrderId,
      organization_id: input.organizationId,
      line_type: 'part',
      description: input.title,
      quantity: input.quantity,
      unit_price: input.unitCost ?? 0,
      part_number: input.partNumber ?? null,
      atlas_order_record_id: input.orderId,
      atlas_offer_id: order.part_offer_id ?? null,
      status: 'ordered',
    })

  if (lineError) {
    console.error('[orders] attachToWorkOrder line insert error', lineError)
    return false
  }

  // Write attach event
  await supabase.from('atlas_order_events').insert({
    organization_id: input.organizationId,
    order_record_id: input.orderId,
    user_id: input.userId,
    event_type: 'attached_to_work_order',
    metadata_json: { work_order_id: input.workOrderId },
  })

  return true
}

export async function getOrdersForOrg(
  organizationId: string,
  options: { aircraftId?: string; workOrderId?: string; status?: PartOrderStatus; limit?: number; offset?: number } = {}
): Promise<AtlasOrderRecord[]> {
  const supabase = createServerSupabase()

  let query = supabase
    .from('atlas_order_records')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (options.aircraftId) query = query.eq('aircraft_id', options.aircraftId)
  if (options.workOrderId) query = query.eq('work_order_id', options.workOrderId)
  if (options.status) query = query.eq('status', options.status)
  if (options.limit) query = query.limit(options.limit)
  if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 20) - 1)

  const { data } = await query
  return (data ?? []) as AtlasOrderRecord[]
}
