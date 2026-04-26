import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { BillingOnboardingClient } from '@/components/billing/BillingOnboardingClient'
import type { Persona } from '@/lib/billing/gate'

interface SearchParams {
  setup?: string
  persona?: string
}

/**
 * Step that fires right after persona-onboarding completes. The user has an
 * org + membership, but their entitlement row is in `state='none'`. Capture a
 * payment method via Stripe-hosted Checkout, then start the 30-day trial.
 *
 * Reachable via /onboarding/billing — and this is the page the BillingBanner
 * "Add card to start trial" CTA points to.
 */
export default async function BillingOnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?redirect=/onboarding/billing')
  }

  // Pick the persona the user has been signing up as. URL ?persona= wins,
  // else fall back to their profile or user_metadata.
  let persona: Persona = 'owner'
  if (searchParams.persona === 'mechanic' || searchParams.persona === 'owner') {
    persona = searchParams.persona
  } else {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('persona')
      .eq('id', user.id)
      .maybeSingle()
    const candidate = profile?.persona ?? user.user_metadata?.persona
    if (candidate === 'mechanic' || candidate === 'owner') {
      persona = candidate
    }
  }

  return (
    <BillingOnboardingClient
      persona={persona}
      setupResult={searchParams.setup ?? null}
    />
  )
}
