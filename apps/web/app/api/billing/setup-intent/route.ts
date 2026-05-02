import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

/**
 * Create a Stripe SetupIntent so the user can attach a payment method to
 * their org without being charged. Returns a client_secret for use with
 * Stripe Elements / Payment Element on the frontend.
 *
 * This is the *first* step of the trial start flow — no trial begins until
 * a payment method is on file (anti-abuse).
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const service = createServiceSupabase()

  const { data: org } = await service
    .from('organizations')
    .select('id, name, stripe_customer_id')
    .eq('id', ctx.organizationId)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get-or-create Stripe customer for this org
  let customerId = org.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name ?? undefined,
      metadata: {
        organization_id: org.id,
        user_id: user.id,
      },
    })
    customerId = customer.id
    await service
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', org.id)
  }

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: {
      organization_id: org.id,
      user_id: user.id,
    },
  })

  await service
    .from('organizations')
    .update({ stripe_setup_intent_id: setupIntent.id })
    .eq('id', org.id)

  return NextResponse.json({
    clientSecret: setupIntent.client_secret,
    setupIntentId: setupIntent.id,
    customerId,
  })
}
