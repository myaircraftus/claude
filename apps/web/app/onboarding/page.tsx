import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getOnboardingPathForPersona } from '@/lib/auth/onboarding'

export default async function OnboardingRedirectPage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirect=/owner/onboarding')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('persona')
    .eq('id', user.id)
    .maybeSingle()

  redirect(getOnboardingPathForPersona(profile?.persona ?? user.user_metadata?.persona))
}
