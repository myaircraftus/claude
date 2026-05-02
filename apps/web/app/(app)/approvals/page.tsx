import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ApprovalsView } from '@/components/approvals/approvals-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Customer Approvals' }

/**
 * Operator-side approvals list page (Spec 1.5). Per-request detail
 * lives at /approvals/[id]. Customer-facing view is at the public
 * /approve/[token] route (no auth).
 */
export default async function ApprovalsListPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Approvals' }]} />
      <main className="flex-1 overflow-y-auto">
        <ApprovalsView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
