import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const PRODUCT_MAP: Record<string, string> = {
  prebuy_packet: process.env.STRIPE_PRODUCT_PREBUY!,
  lender_packet: process.env.STRIPE_PRODUCT_LENDER!,
  insurer_packet: process.env.STRIPE_PRODUCT_INSURER!,
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { aircraft_id, report_type } = await req.json()
  if (typeof aircraft_id !== 'string' || !aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }
  const priceId = PRODUCT_MAP[report_type]
  if (!priceId) return NextResponse.json({ error: 'Invalid report type for purchase' }, { status: 400 })

  const service = createServiceSupabase()
  const { data: aircraftData } = await service
    .from('aircraft')
    .select('organization_id')
    .eq('id', aircraft_id)
    .maybeSingle()

  if (!aircraftData?.organization_id) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // Caller must belong to the aircraft's owning org. Without this check, any
  // authenticated user could pass an arbitrary aircraft_id and cause Stripe to
  // bill the victim org's saved customer for a report packet.
  const { data: membership } = await service
    .from('organization_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', aircraftData.organization_id)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: org } = await service
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', aircraftData.organization_id)
    .maybeSingle()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: org?.stripe_customer_id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      aircraft_id,
      report_type,
      user_id: user.id,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence?report_purchased=true&report_type=${report_type}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence`,
  })

  return NextResponse.json({ checkout_url: session.url })
}
