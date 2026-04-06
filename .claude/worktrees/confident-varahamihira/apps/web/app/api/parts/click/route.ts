import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { createOrderRecord } from '@/lib/parts/orders'
import { canWriteParts } from '@/lib/parts/permissions'
import type { OrgRole } from '@/types'

const clickSchema = z.object({
  search_id: z.string().min(1),
  offer_id: z.string().min(1),
  aircraft_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(999).optional().default(1),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    if (!canWriteParts(membership.role as OrgRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = clickSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
    }

    const { search_id, offer_id, aircraft_id, work_order_id, quantity } = parsed.data

    // Fetch the offer to get vendor URL and details
    const { data: offer, error: offerError } = await supabase
      .from('atlas_part_offers')
      .select('*')
      .eq('id', offer_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (offerError || !offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 })
    }

    // Sanitize the product URL
    let redirectUrl: string
    try {
      const u = new URL(offer.product_url)
      // Only allow http/https
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('invalid protocol')
      redirectUrl = u.toString()
    } catch {
      return NextResponse.json({ error: 'Invalid vendor URL' }, { status: 400 })
    }

    const orderRecord = await createOrderRecord({
      organizationId: membership.organization_id,
      userId: user.id,
      searchId: search_id,
      offerId: offer_id,
      aircraftId: aircraft_id ?? null,
      workOrderId: work_order_id ?? null,
      quantity,
      vendorName: offer.vendor_name,
      vendorUrl: redirectUrl,
      selectedPartNumber: offer.part_number ?? null,
      selectedTitle: offer.title,
      selectedCondition: offer.condition ?? null,
      selectedImageUrl: offer.image_url ?? null,
      unitPrice: offer.price ?? null,
      shippingPrice: offer.shipping_price ?? null,
      currency: offer.currency ?? 'USD',
    })

    if (!orderRecord) {
      return NextResponse.json({ error: 'Failed to create order record' }, { status: 500 })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: membership.organization_id,
      user_id: user.id,
      action: 'part.offer_clicked',
      entity_type: 'atlas_order_record',
      entity_id: orderRecord.id as unknown as string,
      metadata_json: {
        offer_id,
        vendor: offer.vendor_name,
        part_number: offer.part_number ?? null,
        aircraft_id: aircraft_id ?? null,
      },
    })

    return NextResponse.json({
      order_record_id: orderRecord.id,
      redirect_url: redirectUrl,
      status: orderRecord.status,
    })
  } catch (err) {
    console.error('[POST /api/parts/click] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
