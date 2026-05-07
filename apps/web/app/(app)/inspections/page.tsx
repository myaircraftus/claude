import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { InspectionsView } from '@/components/inspections/inspections-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Inspections' }

/**
 * Inspections list page (Spec 1.3) — status-filtered list with inline create
 * (pick aircraft + procedure). Per-inspection runner lives at /inspections/[id].
 */
export default async function InspectionsListPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Inspections' }]} />
      <main className="flex-1 overflow-y-auto">
        <InspectionsView userRole={membership.role as OrgRole} />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="inspections" /></div>
      </main>
    </div>
  )
}
