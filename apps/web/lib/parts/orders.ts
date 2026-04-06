// Orders service: create click-outs, attach to work orders, update statuses, log events.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PartOrderStatus } from './types'

export interface CreateClickOutInput {
  organizationId: string
  userId: string
  partOfferId: string
  partSearchId?: string | null
  aircraftId?: string | null
  workOrderId?: string | null
  maintenanceDraftId?: string | null
  quantity?: number
}

export async function createClickOut(
  supabase: SupabaseClient,
  input: CreateClickOutInput
): Promise<{ orderId: string; productUrl: string | null }> {
  // Load the offer to snapshot its fields
  const { data: offer, error: offerErr } = await (supabase as any)
    .from('part_offers')
    .select('*')
    .eq('id', input.partOfferId)
    .eq('organization_id', input.organizationId)
    .single()

  if (offerErr || !offer) throw new Error('Offer not found')

  const quantity = Math.max(1, input.quantity ?? 1)
  const unitPrice = offer.price ?? null
  const shipping = offer.shipping_price ?? null
  const totalPrice = unitPrice != null ? unitPrice * quantity + (shipping ?? 0) : null

  const { data: record, error: insertErr } = await (supabase as any)
    .from('part_order_records')
    .insert({
      organization_id: input.organizationId,
      aircraft_id: input.aircraftId ?? offer.aircraft_id ?? null,
      work_order_id: input.workOrderId ?? offer.work_order_id ?? null,
      maintenance_draft_id: input.maintenanceDraftId ?? null,
      part_search_id: input.partSearchId ?? offer.part_search_id ?? null,
      part_offer_id: offer.id,
      user_id: input.userId,
      status: 'clicked_out' as PartOrderStatus,
      quantity,
      unit_price: unitPrice,
      shipping_price: shipping,
      total_price: totalPrice,
      currency: offer.currency ?? null,
      vendor_name: offer.vendor_name ?? null,
      vendor_url: offer.product_url ?? null,
      selected_part_number: offer.part_number ?? null,
      selected_title: offer.title ?? null,
      selected_condition: offer.condition ?? null,
      selected_image_url: offer.image_url ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !record) throw new Error(insertErr?.message ?? 'Failed to create order record')

  await (supabase as any).from('part_order_events').insert({
    organization_id: input.organizationId,
    part_order_record_id: record.id,
    user_id: input.userId,
    event_type: 'clicked_out',
    metadata_json: { offer_id: offer.id, vendor: offer.vendor_name },
  })

  // If attached to a work order, also create a work_order_parts line item
  const workOrderId = input.workOrderId ?? offer.work_order_id ?? null
  if (workOrderId) {
    await (supabase as any).from('work_order_parts').insert({
      organization_id: input.organizationId,
      work_order_id: workOrderId,
      aircraft_id: input.aircraftId ?? offer.aircraft_id ?? null,
      part_order_record_id: record.id,
      part_offer_id: offer.id,
      part_number: offer.part_number ?? null,
      title: offer.title ?? 'Part',
      quantity,
      unit_cost: unitPrice,
      total_cost: totalPrice,
      status: 'ordered',
      source: 'search',
    })
  }

  return { orderId: record.id, productUrl: offer.product_url ?? null }
}

export interface UpdateOrderInput {
  organizationId: string
  userId: string
  orderId: string
  status?: PartOrderStatus
  vendorOrderReference?: string | null
  internalNote?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  installedAt?: string | null
}

export async function updateOrderRecord(
  supabase: SupabaseClient,
  input: UpdateOrderInput
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.status) patch.status = input.status
  if (input.vendorOrderReference !== undefined) patch.vendor_order_reference = input.vendorOrderReference
  if (input.internalNote !== undefined) patch.internal_note = input.internalNote
  if (input.shippedAt !== undefined) patch.shipped_at = input.shippedAt
  if (input.deliveredAt !== undefined) patch.delivered_at = input.deliveredAt
  if (input.installedAt !== undefined) patch.installed_at = input.installedAt
  if (input.status === 'marked_ordered') patch.ordered_at = new Date().toISOString()

  const { error } = await (supabase as any)
    .from('part_order_records')
    .update(patch)
    .eq('id', input.orderId)
    .eq('organization_id', input.organizationId)

  if (error) throw new Error(error.message)

  await (supabase as any).from('part_order_events').insert({
    organization_id: input.organizationId,
    part_order_record_id: input.orderId,
    user_id: input.userId,
    event_type: input.status ? `status_changed:${input.status}` : 'updated',
    metadata_json: patch,
  })
}

export async function listOrders(
  supabase: SupabaseClient,
  organizationId: string,
  filters: { aircraftId?: string; workOrderId?: string; status?: PartOrderStatus; limit?: number } = {}
) {
  let q: any = (supabase as any)
    .from('part_order_records')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100)
  if (filters.aircraftId) q = q.eq('aircraft_id', filters.aircraftId)
  if (filters.workOrderId) q = q.eq('work_order_id', filters.workOrderId)
  if (filters.status) q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}
