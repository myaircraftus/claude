import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2024-04-10' })

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(id, stripe_customer_id, name)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const priceId = process.env.STRIPE_PRICE_PER_AIRCRAFT
  if (!priceId) {
    return NextResponse.json({ error: 'Per-aircraft pricing is not configured' }, { status: 500 })
  }

  const organizationId = membership.organization_id
  const service = createServiceSupabase()

  // Count active (non-archived) aircraft to size the subscription quantity.
  const { count: aircraftCount } = await service
    .from('aircraft')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_archived', false)

  const quantity = Math.max(1, aircraftCount ?? 0)

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.myaircraft.us'

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity }],
    customer_email: profile?.email ?? undefined,
    metadata: {
      organization_id: organizationId,
      billing_model: 'per_aircraft',
      aircraft_quantity: String(quantity),
    },
    subscription_data: {
      metadata: {
        organization_id: organizationId,
        billing_model: 'per_aircraft',
      },
    },
    success_url: `${appUrl}/settings?tab=billing&upgraded=1`,
    cancel_url: `${appUrl}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url, quantity })
}
