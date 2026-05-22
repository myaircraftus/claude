/**
 * /admin/users — compatibility redirect.
 *
 * The SOP corpus and the AI Simulator scenarios reference /admin/users as
 * the canonical mechanic-onboarding surface (SOP-10 §4, SOP-19, simulator
 * "Onboard a New Mechanic"). The real user-management UI lives at
 * /workforce/dashboard, /admin/tenants, and the per-aircraft "Invite
 * Mechanic" modal on /aircraft/[id]. Until we build a dedicated
 * /admin/users page, this shim redirects to the workforce dashboard so
 * SOP deep-links don't 404.
 *
 * Discovered during the 2026-05-21 button audit: /admin/users returned
 * 404 even though three internal documents referenced it.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminUsersRedirect() {
  redirect('/workforce/dashboard')
}
