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
    return NextResponse.json(out)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Click-out failed' }, { status: 500 })
  }
}
