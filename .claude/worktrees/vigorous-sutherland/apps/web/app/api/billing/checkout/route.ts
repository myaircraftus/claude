import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabase } from '@/lib/supabase/server'
import { z } from 'zod'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const schema = z.object({
  plan: z.enum(['pro', 'fleet', 'enterprise']),
})

const PRICE_IDS: Record<string, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  fleet: process.env.STRIPE_PRICE_FLEET,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(stripe_customer_id, name)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const priceId = PRICE_IDS[body.data.plan]
  if (!priceId) return NextResponse.json({ error: 'Plan not configured' }, { status: 500 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', user.id)
    .single()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: profile?.email,
    metadata: { organization_id: membership.organization_id },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing&upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url })
}
