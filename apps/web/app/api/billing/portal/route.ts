import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabase } from '@/lib/supabase/server'

// Phase 17 Sprint 17.5 — refuse to instantiate Stripe with the
// placeholder key from Phase 14 mock-mode. The route returns 503 in
// that case so /org/billing surfaces a "needs config" state cleanly.
function hasRealStripeKey(): boolean {
  const k = process.env.STRIPE_SECRET_KEY?.trim()
  return Boolean(k) && !k!.startsWith('sk_placeholder')
}

const stripe = hasRealStripeKey()
  ? new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
  : null

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured', hint: 'Set STRIPE_SECRET_KEY (sk_test_… for testing).' }, { status: 503 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(stripe_customer_id, name)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const org = (membership as any).organizations
  let customerId = org.stripe_customer_id

  // Create Stripe customer if doesn't exist
  if (!customerId) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    const customer = await stripe.customers.create({
      email: profile?.email,
      name: org.name,
      metadata: { organization_id: membership.organization_id },
    })
    customerId = customer.id

    await supabase
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', membership.organization_id)
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url })
}
