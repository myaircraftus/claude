import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
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
  const priceId = PRODUCT_MAP[report_type]
  if (!priceId) return NextResponse.json({ error: 'Invalid report type for purchase' }, { status: 400 })

  const { data: aircraftData } = await supabase
    .from('aircraft')
    .select('organization_id')
    .eq('id', aircraft_id)
    .single()

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', aircraftData?.organization_id)
    .single()

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
