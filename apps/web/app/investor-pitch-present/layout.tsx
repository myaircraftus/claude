/**
 * Presenter view shell — bare layout (no sidebar) with the same admin
 * gate as the Investor Room. We put this route SIBLING to /investor-room
 * (not nested under it) so the parent layout's sidebar doesn't render
 * on the presenter view — Next.js App Router has no way to opt out of
 * a parent layout once the URL prefix has claimed it.
 */
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export const metadata = {
  // Root layout adds the ' | myaircraft.us' suffix via metadata template.
  title: 'Pitch · Present',
}

export default async function PresentLayout({ children }: { children: ReactNode }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/investor-pitch-present')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_platform_admin) redirect('/dashboard')

  return <div className="min-h-screen bg-slate-950 text-white">{children}</div>
}
