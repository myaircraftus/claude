import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth/require-role'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'

/**
 * Server-side role gate for /mechanic and all /mechanic/* routes.
 *
 * Only owner, admin, and mechanic roles may access this area. Any other role
 * (pilot, viewer, auditor) is redirected to /dashboard. This is the authoritative
 * check — the client-side persona toggle in AppLayout is a UX convenience only.
 */
export default async function MechanicLayout({ children }: { children: ReactNode }) {
  await requireRole(MECHANIC_AND_ABOVE)
  return <>{children}</>
}
