import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createServiceSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const schema = z.object({
  setupIntentId: z.string().startsWith('seti_'),
})

/**
 * After the client confirms the SetupIntent on the frontend, we read the
 * resulting payment method off Stripe (server-side, trusted) and persist
 * it on the organization. The card fingerprint is what we use to detect
 * the same card being used across multiple trial signups.
 */
export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const intent = await stripe.setupIntents.retrieve(body.data.setupIntentId, {
    expand: ['payment_method'],
  })

  if (intent.status !== 'succeeded') {
    return NextResponse.json(
      { error: `SetupIntent not yet succeeded (status: ${intent.status})` },
      { status: 400 },
    )
  }

  // Verify this SetupIntent belongs to this org
  if (intent.metadata?.organization_id !== ctx.organizationId) {
    return NextResponse.json({ error: 'SetupIntent / org mismatch' }, { status: 403 })
  }

  const pm = intent.payment_method as Stripe.PaymentMethod | string | null
  const paymentMethodId = typeof pm === 'string' ? pm : pm?.id ?? null
  const fingerprint = typeof pm === 'object' && pm !== null ? pm.card?.fingerprint ?? null : null

  if (!paymentMethodId) {
    return NextResponse.json({ error: 'No payment method on the SetupIntent' }, { status: 400 })
  }

  const service = createServiceSupabase()
  await service
    .from('organizations')
    .update({
      stripe_payment_method_id: paymentMethodId,
      payment_method_card_fingerprint: fingerprint,
      payment_method_added_at: new Date().toISOString(),
    })
    .eq('id', ctx.organizationId)

  return NextResponse.json({ ok: true, fingerprint })
}
