import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const bodySchema = z.object({
  // Where to redirect the user after they finish entering their card.
  // Server appends `?setup=success` / `?setup=cancelled` so the page can react.
  returnPath: z.string().optional(),
  // The persona we plan to start a trial for once a card is on file. Stored
  // on the SetupIntent metadata so the webhook can hand it back to the
  // start-trial flow if we want to auto-start.
  persona: z.enum(['owner', 'mechanic']).optional(),
})

/**
 * Hosted Stripe Checkout in `mode: 'setup'`. Captures a payment method
 * without charging the user, then sends them back to the app. The Stripe
 * webhook (`checkout.session.completed` with mode==='setup') persists the
 * payment_method + card fingerprint on the org so the anti-abuse checks at
 * trial-start time can dedup against reused cards.
 *
 * We use hosted Checkout instead of Stripe Elements so the app doesn't need
 * @stripe/stripe-js / @stripe/react-stripe-js as deps and the PCI surface
 * stays entirely on Stripe's side.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveRequestOrgContext(req)
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = createServerSupabase()
    const service = createServiceSupabase()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown = {}
    try {
      body = await req.json()
    } catch {
      // empty body is fine — both fields are optional
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }
    const { returnPath, persona } = parsed.data

    const { data: org } = await service
      .from('organizations')
      .select('id, name, slug, stripe_customer_id')
      .eq('id', ctx.organizationId)
      .maybeSingle()

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    // Get-or-create the Stripe customer for this org.
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

    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://myaircraft.us'
    const safeReturn =
      returnPath && returnPath.startsWith('/') ? returnPath : '/settings/billing'
    const successUrl = `${origin}${safeReturn}${safeReturn.includes('?') ? '&' : '?'}setup=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}${safeReturn}${safeReturn.includes('?') ? '&' : '?'}setup=cancelled`

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        organization_id: org.id,
        user_id: user.id,
        ...(persona ? { intended_persona: persona } : {}),
      },
      setup_intent_data: {
        metadata: {
          organization_id: org.id,
          user_id: user.id,
          ...(persona ? { intended_persona: persona } : {}),
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[setup-checkout] error', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
