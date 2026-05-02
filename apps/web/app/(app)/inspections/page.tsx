import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { InspectionsView } from '@/components/inspections/inspections-view'
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
      </main>
    </div>
  )
}
