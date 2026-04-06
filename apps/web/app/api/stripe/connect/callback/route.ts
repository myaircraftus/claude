// GET /api/stripe/connect/callback — Handle return from Stripe Connect onboarding

import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as any })

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://myaircraft.us'
  const accountId = req.nextUrl.searchParams.get('account_id')

  if (!accountId) {
    return NextResponse.redirect(`${appUrl}/settings?tab=payments&error=missing_account`)
  }

  try {
    // Verify the Stripe account status
    const account = await stripe.accounts.retrieve(accountId)

    if (account.charges_enabled && account.details_submitted) {
      // Account is fully onboarded — update membership
      const supabase = createServiceSupabase()

      await supabase
        .from('organization_memberships')
        .update({ stripe_connect_onboarded: true })
        .eq('stripe_connect_account_id', accountId)

      return NextResponse.redirect(`${appUrl}/settings?tab=payments&stripe_connected=true`)
    }

    // Onboarding not yet complete — redirect back to settings
    return NextResponse.redirect(`${appUrl}/settings?tab=payments&stripe_connected=pending`)
  } catch (err: any) {
    console.error('[Stripe Connect callback] error:', err)
    return NextResponse.redirect(`${appUrl}/settings?tab=payments&error=connect_failed`)
  }
}
