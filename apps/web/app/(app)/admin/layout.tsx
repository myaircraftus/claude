import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/require-role'
import { ADMIN_AND_ABOVE } from '@/lib/roles'

/**
 * Server-side gate for /admin and all /admin/* routes.
 *
 * Two-tier check:
 *   1. User must be owner or admin in their active organization.
 *   2. User must have `is_platform_admin = true` on their profile (platform-wide
 *      Anthropic/myaircraft staff), since /admin is the platform admin surface.
 *
 * Anyone failing either check is redirected to /dashboard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(ADMIN_AND_ABOVE)

  // Additional platform-admin gate — /admin/* is for myaircraft staff only.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_platform_admin) {
    redirect('/dashboard')
  }

  return <>{children}</>
}
