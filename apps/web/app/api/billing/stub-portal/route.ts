/**
 * POST /api/billing/stub-portal  (Spec 6.3 stub layer)
 *
 * Adapter-routed customer portal session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getStripeClient, isStripeMock } from '@/lib/billing/stripe-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  // Look up the active subscription's stripe_customer_id from the mirror table.
  const { data: sub } = await supabase
    .from('stripe_subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', membership.organization_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const customer_id = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? 'cus_test_mock'

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const session = await getStripeClient().createPortalSession({
    customer_id,
    return_url: `${origin}/org/billing`,
  })

  return NextResponse.json({ url: session.url, mock: isStripeMock() })
}
