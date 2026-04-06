// POST /api/parts/click
// Creates a click-out order record and returns the vendor productUrl to open.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createClickOut } from '@/lib/parts/orders'

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
  if (!body.part_offer_id) {
    return NextResponse.json({ error: 'part_offer_id is required' }, { status: 400 })
  }

  try {
    const out = await createClickOut(supabase, {
      organizationId: membership.organization_id,
      userId: user.id,
      partOfferId: String(body.part_offer_id),
      partSearchId: body.part_search_id ?? null,
      aircraftId: body.aircraft_id ?? null,
      workOrderId: body.work_order_id ?? null,
      maintenanceDraftId: body.maintenance_draft_id ?? null,
      quantity: typeof body.quantity === 'number' ? body.quantity : 1,
    })

    // Auto-save to parts_library: upsert by org + part_number + vendor.
    // On conflict, increment usage_count and refresh last_ordered_at.
    try {
      const { data: offer } = await (supabase as any)
        .from('part_offers')
        .select('part_number, title, vendor_name, price, condition, image_url, product_url, currency')
        .eq('id', String(body.part_offer_id))
        .eq('organization_id', membership.organization_id)
        .single()

      if (offer?.part_number && offer?.title) {
        const now = new Date().toISOString()
        const orgId = membership.organization_id
        const vendor = offer.vendor_name ?? null

        // Check if already in library
        let existingQ: any = (supabase as any)
          .from('parts_library')
          .select('id, usage_count')
          .eq('organization_id', orgId)
          .eq('part_number', offer.part_number)
        existingQ = vendor
          ? existingQ.eq('preferred_vendor', vendor)
          : existingQ.is('preferred_vendor', null)

        const { data: existing } = await existingQ.maybeSingle()

        if (existing) {
          // Update: increment usage_count, refresh last_ordered_at
          await (supabase as any)
            .from('parts_library')
            .update({
              usage_count: (existing.usage_count ?? 0) + 1,
              last_ordered_at: now,
              base_price: offer.price ?? undefined,
              vendor_url: offer.product_url ?? undefined,
            })
            .eq('id', existing.id)
        } else {
          // Insert new library entry
          await (supabase as any)
            .from('parts_library')
            .insert({
              organization_id: orgId,
              part_number: offer.part_number,
              title: offer.title,
              preferred_vendor: vendor,
              vendor_url: offer.product_url ?? null,
              base_price: offer.price ?? null,
              currency: offer.currency ?? 'USD',
              condition: offer.condition ?? null,
              image_url: offer.image_url ?? null,
              created_by: user.id,
              usage_count: 1,
              last_ordered_at: now,
            })
        }
      }
    } catch {
      // Library auto-save is non-critical; don't block the click-out response
    }

    return NextResponse.json(out)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Click-out failed' }, { status: 500 })
  }
}
