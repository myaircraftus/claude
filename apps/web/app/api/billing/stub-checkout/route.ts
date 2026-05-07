/**
 * POST /api/billing/stub-checkout  (Spec 6.3 stub layer)
 *
 * Adapter-routed checkout: calls getStripeClient() so mock-vs-real is
 * a single env-var flip. Distinct from /api/billing/checkout (legacy
 * direct-SDK) — the /org/billing page consumes this stub-routed path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getStripeClient, isStripeMock } from '@/lib/billing/stripe-client'

export const dynamic = 'force-dynamic'

interface Body {
  price_id?: string
  success_url?: string
  cancel_url?: string
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  let body: Body
  try { body = (await req.json()) as Body } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.price_id) return NextResponse.json({ error: 'price_id required' }, { status: 400 })

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const session = await getStripeClient().createCheckoutSession({
    organization_id: membership.organization_id,
    customer_email: user.email,
    price_id: body.price_id,
    success_url: body.success_url ?? `${origin}/org/billing?success=1`,
    cancel_url: body.cancel_url ?? `${origin}/org/billing?canceled=1`,
    metadata: { user_id: user.id },
  })

  return NextResponse.json({ session_id: session.id, url: session.url, mock: isStripeMock() })
}
