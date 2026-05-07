/**
 * POST /api/webhooks/stripe-stub  (Spec 6.3 stub layer)
 *
 * Mock-aware Stripe webhook handler. Real /api/webhooks/stripe stays
 * untouched; this stub-prefixed route is what the mock checkout flow
 * posts to during local testing — the body is plain JSON (no signed
 * Stripe signature). When STRIPE_USE_MOCK=false + real webhook
 * configured at /api/webhooks/stripe, this stub becomes a no-op
 * convenience for local dev.
 *
 * Updates the stripe_subscriptions + stripe_invoices mirror tables on
 * checkout.session.completed / invoice.* / customer.subscription.* events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getStripeClient, isStripeMock } from '@/lib/billing/stripe-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature')

  let event
  try {
    event = await getStripeClient().parseWebhookEvent({ payload, signature })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid event' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const obj = event.data.object as Record<string, unknown>

  switch (event.type) {
    case 'checkout.session.completed': {
      // Mock checkout session → upsert a subscription + organizations row link.
      const orgId = (obj.metadata as Record<string, string> | undefined)?.organization_id
      const subId = (obj.subscription as string | undefined) ?? `sub_test_mock_${Math.random().toString(36).slice(2, 12)}`
      const customerId = (obj.customer as string | undefined) ?? 'cus_test_mock'
      if (orgId) {
        await service.from('stripe_subscriptions').upsert({
          id: subId, organization_id: orgId, stripe_customer_id: customerId,
          status: 'active',
          price_id: (obj.metadata as Record<string, string> | undefined)?.price_id ?? null,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
          metadata: (obj.metadata as Record<string, string> | undefined) ?? {},
        }, { onConflict: 'id' })
      }
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = obj as { id: string; customer: string; status: string; metadata?: Record<string, string>; cancel_at_period_end?: boolean }
      await service.from('stripe_subscriptions').update({
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
      }).eq('id', sub.id)
      break
    }
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      const inv = obj as { id: string; customer: string; subscription: string | null; status: string; amount_due: number; amount_paid: number; currency: string; metadata?: Record<string, string> }
      // Need org id — pull from the linked subscription.
      const { data: subRow } = await service
        .from('stripe_subscriptions').select('organization_id')
        .eq('id', inv.subscription ?? '').maybeSingle()
      const orgId = (subRow as { organization_id?: string } | null)?.organization_id
      if (orgId) {
        await service.from('stripe_invoices').upsert({
          id: inv.id, organization_id: orgId,
          stripe_customer_id: inv.customer,
          subscription_id: inv.subscription,
          status: inv.status,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          currency: inv.currency,
          metadata: inv.metadata ?? {},
        }, { onConflict: 'id' })
      }
      break
    }
  }

  return NextResponse.json({ ok: true, mock: isStripeMock(), event_type: event.type })
}
