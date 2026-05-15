import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { SupportBanner } from '@/components/admin/SupportBanner'

/**
 * Server-side gate for /admin and all /admin/* routes.
 *
 * Authorization is SOLELY `user_profiles.is_platform_admin = true`. The
 * /admin/* console is the myaircraft platform-staff surface — a platform
 * admin's authority to it is independent of what role they hold in any
 * individual customer organization.
 *
 * 2026-05-15 fix: this layout previously also ran
 * `requireRole(['owner','admin'])` against the user's ACTIVE organization.
 * That conflated platform-staff status with org role — a platform admin
 * who was only a low-role member of their active org (e.g. a viewer in a
 * customer org they were investigating) got silently bounced to
 * /dashboard even though is_platform_admin was true. The org-role gate
 * was removed; the is_platform_admin check below is the correct and
 * sufficient authorization, and non-staff are still fully blocked.
 *
 * Failure → redirect to /dashboard with a console.warn so the cause is
 * visible in runtime logs (Phase 15 F1: silent redirects were
 * diagnose-impossible from the browser).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
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

  return (
    <>
      <SupportBanner />
      {children}
    </>
  )
}
