import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth/require-role'
import { WORKSPACE_ACCESS } from '@/lib/roles'

/**
 * Server-side role gate for /workspace (AI Command Center).
 *
 * Only owner, admin, and mechanic roles may access the AI workspace.
 * Pilots, viewers, and auditors are redirected to /dashboard.
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  await requireRole(WORKSPACE_ACCESS)
  return <>{children}</>
}
