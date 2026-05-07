import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { CompliancePageView } from '@/components/compliance/compliance-page-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Compliance' }

/**
 * Compliance page (Spec 1.2) — whole-org compliance dashboard with the
 * Due List as the default view.
 *
 * Per-aircraft compliance UI lives at /(app)/aircraft/[id]/compliance.
 */
export default async function CompliancePage() {
  const { profile, membership } = await requireAppServerSession()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Compliance' }]} />
      <main className="flex-1 overflow-y-auto">
        <CompliancePageView userRole={membership.role as OrgRole} />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="compliance_items" /></div>
      </main>
    </div>
  )
}
