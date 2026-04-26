import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'
import { PRODUCTS, skuForPriceId } from '@/lib/billing/products'
import type { Persona } from '@/lib/billing/gate'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

type StripeStatus = Stripe.Subscription.Status
type EntitlementStatus = 'trial' | 'active' | 'paywalled' | 'cancelled' | 'past_due'

function mapStripeStatus(s: StripeStatus): EntitlementStatus {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'cancelled'
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
      return 'paywalled'
    default:
      return 'paywalled'
  }
}

async function findOrgByCustomer(customerId: string): Promise<string | null> {
  const supabase = createServiceSupabase()
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data?.id ?? null
}

async function applySubscriptionToEntitlements(sub: Stripe.Subscription, organizationId: string) {
  const supabase = createServiceSupabase()
  const status = mapStripeStatus(sub.status)
  const priceId = sub.items.data[0]?.price.id ?? null
  const sku = skuForPriceId(priceId)

  if (!sku) {
    // Unknown price ID — could be a legacy plan (starter/pro/fleet/enterprise).
    // Update org-level fields for back-compat but don't touch entitlements.
    await supabase
      .from('organizations')
      .update({
        stripe_subscription_id: sub.id,
        subscription_status: status === 'active' ? 'active' : 'paywalled',
      })
      .eq('id', organizationId)
    return
  }

  const product = PRODUCTS[sku]
  const grants: Persona[] = product.grants
  const isBundle = sku === 'bundle'

  // Upsert one entitlement row per granted persona
  const rows = grants.map((persona) => ({
    organization_id: organizationId,
    persona,
    status,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    bundle: isBundle,
    paywalled_reason: status === 'paywalled' ? 'payment_failed'
      : status === 'cancelled' ? 'cancelled'
      : null,
    // Don't clobber trial_ends_at if the sub is active — but if Stripe says
    // it's trialing, sync the trial end date
    ...(sub.trial_end ? { trial_ends_at: new Date(sub.trial_end * 1000).toISOString() } : {}),
  }))

  for (const row of rows) {
    await supabase
      .from('entitlements')
      .upsert(row, { onConflict: 'organization_id,persona' })
  }

  // Mirror to legacy organizations.subscription_status for back-compat
  await supabase
    .from('organizations')
    .update({
      stripe_subscription_id: sub.id,
      subscription_status: status === 'active' ? 'active' : status,
    })
    .eq('id', organizationId)
}

async function applyCancellation(sub: Stripe.Subscription, organizationId: string) {
  const supabase = createServiceSupabase()
  const priceId = sub.items.data[0]?.price.id ?? null
  const sku = skuForPriceId(priceId)

  if (!sku) {
    await supabase
      .from('organizations')
      .update({
        stripe_subscription_id: null,
        subscription_status: 'cancelled',
        paywalled_reason: 'cancelled',
      })
      .eq('id', organizationId)
    return
  }

  const grants = PRODUCTS[sku].grants
  for (const persona of grants) {
    await supabase
      .from('entitlements')
      .update({
        status: 'cancelled',
        paywalled_reason: 'cancelled',
      })
      .eq('organization_id', organizationId)
      .eq('persona', persona)
      .eq('stripe_subscription_id', sub.id)
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = (sub.metadata?.organization_id as string | undefined)
          ?? await findOrgByCustomer(sub.customer as string)
        if (orgId) {
          await applySubscriptionToEntitlements(sub, orgId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = (sub.metadata?.organization_id as string | undefined)
          ?? await findOrgByCustomer(sub.customer as string)
        if (orgId) {
          await applyCancellation(sub, orgId)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn(`Payment failed for customer ${invoice.customer} (invoice ${invoice.id})`)
        // The subscription.updated event that follows will move the entitlement
        // to past_due → paywalled, so no direct DB write needed here.
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { aircraft_id, report_type, user_id, invoice_id, organization_id } = session.metadata ?? {}

        // Setup-mode session — payment method captured for an org. Persist the
        // pm id + card fingerprint so anti-abuse trial-start checks can dedup.
        if (session.mode === 'setup' && organization_id && session.setup_intent) {
          try {
            const setupIntentId =
              typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent.id
            const si = await stripe.setupIntents.retrieve(setupIntentId, {
              expand: ['payment_method'],
            })
            const pm = typeof si.payment_method === 'string'
              ? await stripe.paymentMethods.retrieve(si.payment_method)
              : (si.payment_method as Stripe.PaymentMethod | null)

            const fingerprint = pm?.card?.fingerprint ?? null
            const pmId = pm?.id ?? null

            await supabase
              .from('organizations')
              .update({
                stripe_payment_method_id: pmId,
                payment_method_card_fingerprint: fingerprint,
                payment_method_added_at: new Date().toISOString(),
                stripe_setup_intent_id: setupIntentId,
              })
              .eq('id', organization_id)

            // Set this PM as the customer's default for off-session charges.
            if (pmId && session.customer) {
              const customerId =
                typeof session.customer === 'string' ? session.customer : session.customer.id
              await stripe.customers.update(customerId, {
                invoice_settings: { default_payment_method: pmId },
              })
            }
          } catch (err) {
            console.error('[stripe webhook] setup-mode handler error', err)
          }
          break
        }

        if (invoice_id) {
          // Connect invoice payment completed
          await supabase
            .from('invoices')
            .update({
              status: 'paid',
              stripe_paid_at: new Date().toISOString(),
              balance_due: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', invoice_id)
        } else if (aircraft_id && report_type && user_id) {
          // Report purchase payment completed
          const { data: aircraftData } = await supabase
            .from('aircraft')
            .select('organization_id')
            .eq('id', aircraft_id)
            .single()

          const { data: job } = await supabase.from('report_jobs').insert({
            aircraft_id,
            organization_id: aircraftData?.organization_id,
            requested_by: user_id,
            report_type,
            is_paid: true,
            stripe_payment_intent_id: session.payment_intent as string,
            status: 'queued',
          }).select().single()

          if (job) {
            generateReport(job.id).catch(console.error)
          }
        }
        break
      }
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
