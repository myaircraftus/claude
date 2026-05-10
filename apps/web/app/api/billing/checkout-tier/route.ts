/**
 * /api/billing/checkout-tier — Phase 17 Sprint 17.5
 *
 * Stripe Checkout for the per-tier × per-aircraft pricing model
 * (pricing-config.ts). Distinct from the Phase 6 /api/billing/checkout
 * which subscribes per-persona SKUs.
 *
 * Request: { tier: 'standard' | 'pro', aircraft_count: number }
 * Response: { url: string } — redirect target.
 *
 * Flow:
 *   1. Resolve org + ensure caller is owner/admin.
 *   2. Resolve the right tier_pricing_skus row by (tier, aircraft_count).
 *   3. Create or reuse the Stripe Customer.
 *   4. Build a Subscription Checkout Session with quantity=aircraft_count.
 *   5. Return the redirect URL.
 *
 * NOTE — Sprint 17.5 ships this as a SCAFFOLD only. Stripe MCP is in
 * live mode and apps/web env has placeholder STRIPE_* keys; the route
 * returns 503 until real test keys land. Once they do, no code change
 * is needed — the route activates automatically.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { TierSlug } from '@/lib/billing/pricing-config'

export const dynamic = 'force-dynamic'

const schema = z.object({
  tier: z.enum(['standard', 'pro']),
  aircraft_count: z.number().int().min(1).max(1000),
})

function bracketMinFor(count: number): number {
  if (count >= 16) return 16
  if (count >= 6) return 6
  return 1
}

interface StripeCheckoutSession { id: string; url: string | null }

async function stripeFetch<T>(secret: string, path: string, form: Record<string, string>): Promise<T> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Stripe ${resp.status}: ${text.slice(0, 300)}`)
  }
  return (await resp.json()) as T
}

function readSecret(): string | null {
  const raw = process.env.STRIPE_SECRET_KEY?.trim()
  if (!raw || raw.startsWith('sk_placeholder')) return null
  return raw
}

export async function POST(req: NextRequest) {
  const secret = readSecret()
  if (!secret) {
    return NextResponse.json(
      { error: 'Stripe not configured', hint: 'Set STRIPE_SECRET_KEY (sk_test_… for testing).' },
      { status: 503 },
    )
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
  }
  const { tier, aircraft_count } = parsed.data

  const service = createServiceSupabase()

  // Resolve org + membership.
  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id, role, organizations(id, name, stripe_customer_id)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!['owner', 'admin'].includes((membership as { role: string }).role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }
  const m = membership as { organization_id: string; organizations: { id: string; name: string; stripe_customer_id: string | null } }

  // Resolve the tier_pricing_skus row.
  const test_mode = secret.startsWith('sk_test_')
  const { data: skuRow } = await service
    .from('tier_pricing_skus')
    .select('stripe_price_id')
    .eq('tier_slug', tier as TierSlug)
    .eq('min_aircraft', bracketMinFor(aircraft_count))
    .eq('is_test_mode', test_mode)
    .maybeSingle()
  if (!skuRow || !(skuRow as { stripe_price_id?: string }).stripe_price_id) {
    return NextResponse.json(
      { error: 'Pricing SKU not synced. Run /api/admin/billing/sync-stripe first.' },
      { status: 503 },
    )
  }

  // Resolve or create Stripe customer.
  let customerId = m.organizations.stripe_customer_id
  if (!customerId) {
    const customer = await stripeFetch<{ id: string }>(secret, '/customers', {
      name: m.organizations.name,
      'metadata[organization_id]': m.organization_id,
    })
    customerId = customer.id
    await service.from('organizations').update({ stripe_customer_id: customerId }).eq('id', m.organization_id)
  }

  const origin = req.nextUrl.origin
  const session = await stripeFetch<StripeCheckoutSession>(secret, '/checkout/sessions', {
    mode: 'subscription',
    customer: customerId,
    'line_items[0][price]': (skuRow as { stripe_price_id: string }).stripe_price_id,
    'line_items[0][quantity]': String(aircraft_count),
    success_url: `${origin}/org/billing?upgraded=1`,
    cancel_url: `${origin}/org/billing?cancelled=1`,
    'metadata[organization_id]': m.organization_id,
    'metadata[tier]': tier,
    'metadata[aircraft_count]': String(aircraft_count),
    allow_promotion_codes: 'true',
  })

  return NextResponse.json({ url: session.url, id: session.id })
}

// Test exports.
export const __testing = { bracketMinFor, readSecret }
