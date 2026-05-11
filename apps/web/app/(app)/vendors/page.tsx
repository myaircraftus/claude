import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { VendorsView } from '@/components/vendors/vendors-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Vendors' }

/**
 * Vendors page (Spec 2.2). Vendor master list. Back-references parts
 * inventory (068), purchase orders (068), and outside-service WO lines
 * (016).
 */
export default async function VendorsPage() {
  // Phase 18 Sprint 18.4 — shop/admin-only route (closes Phase 15 F2)
  const guard = await requirePersona(['shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Vendors' }]} />
      <main className="flex-1 overflow-y-auto">
        <VendorsView userRole={membership.role as OrgRole} />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="vendors" /></div>
      </main>
    </div>
  )
}
