import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceSupabase } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const PLAN_LIMITS: Record<string, {
  plan: string
  aircraft: number
  storage_gb: number
  queries: number
}> = {
  starter: { plan: 'starter', aircraft: 1, storage_gb: 2, queries: 100 },
  pro: { plan: 'pro', aircraft: 5, storage_gb: 20, queries: 1000 },
  fleet: { plan: 'fleet', aircraft: 25, storage_gb: 100, queries: 10000 },
  enterprise: { plan: 'enterprise', aircraft: 9999, storage_gb: 1000, queries: 999999 },
}

// Map Stripe price IDs to plan names (configure in dashboard)
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_STARTER ?? '']: 'starter',
  [process.env.STRIPE_PRICE_PRO ?? '']: 'pro',
  [process.env.STRIPE_PRICE_FLEET ?? '']: 'fleet',
  [process.env.STRIPE_PRICE_ENTERPRISE ?? '']: 'enterprise',
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
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const priceId = sub.items.data[0]?.price.id
        const planName = PRICE_TO_PLAN[priceId] ?? 'starter'
        const limits = PLAN_LIMITS[planName]

        await supabase
          .from('organizations')
          .update({
            plan: limits.plan,
            plan_aircraft_limit: limits.aircraft,
            plan_storage_gb: limits.storage_gb,
            plan_queries_monthly: limits.queries,
            stripe_subscription_id: sub.id,
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const customerId = sub.customer as string
        const limits = PLAN_LIMITS['starter']

        await supabase
          .from('organizations')
          .update({
            plan: 'starter',
            plan_aircraft_limit: limits.aircraft,
            plan_storage_gb: limits.storage_gb,
            plan_queries_monthly: limits.queries,
            stripe_subscription_id: null,
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn(`Payment failed for customer ${invoice.customer}`)
        // TODO: Send notification email
        break
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { aircraft_id, report_type, user_id, invoice_id } = session.metadata ?? {}

        if (invoice_id) {
          // Connect invoice payment completed — customer paid via "Pay Now" link
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
