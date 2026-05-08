/**
 * POST /api/billing/stub-checkout  (Spec 6.3 stub layer)
 *
 * Adapter-routed checkout: calls getStripeClient() so mock-vs-real is
 * a single env-var flip. Distinct from /api/billing/checkout (legacy
 * direct-SDK) — the /org/billing page consumes this stub-routed path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getStripeClient, isStripeMock } from '@/lib/billing/stripe-client'
import { parseJsonBody, safeShortStr, safeUrl } from '@/lib/validation/common'

export const dynamic = 'force-dynamic'

// Reference zod implementation per security-audit §5.4. All fields are
// strings under the audit's max-10000 rule (price IDs are short Stripe
// price_xxx slugs; URLs are bounded at 2048). Replicate this pattern in
// other mutating /api/* routes — see lib/validation/common.ts for
// shared building blocks.
const Body = z.object({
  price_id: safeShortStr,
  success_url: safeUrl.optional(),
  cancel_url: safeUrl.optional(),
})

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

  const parsed = await parseJsonBody(req, Body)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

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
