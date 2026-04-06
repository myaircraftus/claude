// POST /api/stripe/connect/onboard — Create Stripe Connect Express account and return onboarding URL

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' as any })

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('id, organization_id, role, stripe_connect_account_id, stripe_connect_onboarded')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin', 'mechanic'].includes((membership as any).role)) {
    return NextResponse.json({ error: 'Only mechanics, admins, and owners can connect Stripe' }, { status: 403 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://myaircraft.us'
  let accountId = (membership as any).stripe_connect_account_id

  try {
    // Create Express account if not already created
    if (!accountId) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', user.id)
        .single()

      const account = await stripe.accounts.create({
        type: 'express',
        email: profile?.email ?? user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          myaircraft_user_id: user.id,
          myaircraft_org_id: (membership as any).organization_id,
        },
      })

      accountId = account.id

      await supabase
        .from('organization_memberships')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', membership.id)
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/settings?tab=payments`,
      return_url: `${appUrl}/settings?tab=payments&stripe_connected=true`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (err: any) {
    console.error('[Stripe Connect onboard] error:', err)
    return NextResponse.json({ error: err?.message ?? 'Failed to create Stripe account' }, { status: 500 })
  }
}
