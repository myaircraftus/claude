// OWNER: Upload/photograph any bill (fuel, maintenance, hangar, insurance).
// AI reads and categorizes the cost. Graphs accumulated spend by category.
//
// Wired 2026-05-15: mounts the existing IntakeView (app/(app)/costs/intake)
// — drag-drop / camera / email-forward receipt inbox. Claude Vision extracts
// vendor + totals + line items into cost_entries. Uploads post to
// /api/costs/upload; extraction runs via /api/costs/intake/[id]/extract.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { IntakeView } from '../../costs/intake/intake-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Upload Cost' }

export default async function UploadCostPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Economics', href: '/economics' }, { label: 'Upload Cost' }]}
      />
      <main className="flex-1 overflow-hidden">
        {/* IntakeView is an org-level receipt inbox — extraction assigns each
            receipt to an aircraft downstream, so no aircraft picker is needed. */}
        <IntakeView orgId={membership.organization_id} />
      </main>
    </div>
  )
}
