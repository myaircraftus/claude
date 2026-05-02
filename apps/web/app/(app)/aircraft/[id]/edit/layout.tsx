import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth/require-role'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'

export default async function AircraftEditLayout({ children }: { children: ReactNode }) {
  await requireRole(MECHANIC_AND_ABOVE)
  return <>{children}</>
}
