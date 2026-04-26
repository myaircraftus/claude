import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { PRODUCTS, type Sku } from '@/lib/billing/products'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const schema = z.object({
  sku: z.enum(['owner', 'mechanic', 'bundle']),
  // Legacy callers may still send `plan` — accept and translate
  plan: z.enum(['pro', 'fleet', 'enterprise']).optional(),
})

const LEGACY_PLAN_TO_SKU: Record<string, Sku> = {
  pro: 'owner',
  fleet: 'bundle',
  enterprise: 'bundle',
}

/**
 * Create a Stripe Checkout session that subscribes the org to one of the
 * persona SKUs (Owner, Mechanic, or Bundle). The webhook handler maps the
 * resulting subscription back to one or more entitlement rows by price ID.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const sku: Sku = parsed.data.sku
    ?? (parsed.data.plan ? LEGACY_PLAN_TO_SKU[parsed.data.plan] : 'owner')
  const product = PRODUCTS[sku]

  if (!product.priceId) {
    return NextResponse.json(
      { error: `${product.displayName} pricing not configured. Set STRIPE_PRICE_${sku.toUpperCase()}_MONTHLY in env.` },
      { status: 503 },
    )
  }

  // Pull the user's active org membership and confirm they're authorized to upgrade
  const service = createServiceSupabase()
  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id, role, organizations(id, name, stripe_customer_id)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgRecord = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations
  if (!orgRecord) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
  }

  // Get-or-create Stripe customer
  let customerId = orgRecord.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: orgRecord.name ?? undefined,
      metadata: { organization_id: orgRecord.id, user_id: user.id },
    })
    customerId = customer.id
    await service
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', orgRecord.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: customerId,
    line_items: [{ price: product.priceId, quantity: 1 }],
    metadata: {
      organization_id: orgRecord.id,
      sku,
    },
    subscription_data: {
      metadata: {
        organization_id: orgRecord.id,
        sku,
      },
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing&upgraded=${sku}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url, sku })
}
