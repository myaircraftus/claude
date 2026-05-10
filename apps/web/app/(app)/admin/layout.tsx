import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/require-role'
import { ADMIN_AND_ABOVE } from '@/lib/roles'

/**
 * Server-side gate for /admin and all /admin/* routes.
 *
 * Two-tier check:
 *   1. User must be owner or admin in their active organization
 *      (requireRole). Failure → redirect to tenant /dashboard.
 *   2. User must have `is_platform_admin = true` on their `user_profiles`
 *      row. The canonical column was set in migration 002. Production has
 *      a CHECK constraint locking is_platform_admin=true to the
 *      info@myaircraft.us account — adding more platform admins requires
 *      relaxing that constraint via a deliberate migration.
 *      Failure → redirect to /dashboard with a console.warn so the cause
 *      is visible in runtime logs (Phase 15 F1: silent redirect made the
 *      block diagnose-impossible from the browser).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole(ADMIN_AND_ABOVE)

  // Additional platform-admin gate — /admin/* is for myaircraft staff only.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.warn('[admin/layout] redirect → /login: no authenticated user')
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('is_platform_admin, email')
    .eq('id', user.id)
    .single()

  if (profileError) {
    // Schema drift or transient DB error. Don't silently redirect —
    // surface the failure mode so the next QA pass can pinpoint it.
    console.warn(
      `[admin/layout] redirect → /dashboard: user_profiles lookup failed for ${user.id} (${user.email ?? '?'}): ${profileError.message}`
    )
    redirect('/dashboard')
  }

  if (!profile) {
    console.warn(
      `[admin/layout] redirect → /dashboard: no user_profiles row for ${user.id} (${user.email ?? '?'}). Auto-create trigger missing or row was deleted.`
    )
    redirect('/dashboard')
  }

  if (!profile.is_platform_admin) {
    console.warn(
      `[admin/layout] redirect → /dashboard: ${profile.email ?? user.email ?? user.id} is not a platform admin. The CHECK constraint in production locks this flag to info@myaircraft.us only.`
    )
    redirect('/dashboard')
  }

  return <>{children}</>
}
