// OWNER PERMISSIONS: All approval actions consolidated here.
// Includes: estimate approvals, invoice approvals, work order line item approvals
// (extra parts, labor, or any add-on to an open work order).
import { requireAppServerSession } from '@/lib/auth/server-app'
import { getCurrentPersona } from '@/lib/persona/server'
import { Topbar } from '@/components/shared/topbar'
import { ApprovalsView } from '@/components/approvals/approvals-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Customer Approvals' }

/**
 * Operator-side approvals list page (Spec 1.5). Per-request detail
 * lives at /approvals/[id]. Customer-facing view is at the public
 * /approve/[token] route (no auth).
 */
export default async function ApprovalsListPage() {
  const { profile, membership } = await requireAppServerSession()
  const { persona } = await getCurrentPersona()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Approvals' }]} />
      <main className="flex-1 overflow-y-auto">
        <ApprovalsView userRole={membership.role as OrgRole} persona={persona} />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="approval_requests" /></div>
      </main>
    </div>
  )
}
