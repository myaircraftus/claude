import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { PartsInventoryView } from '@/components/parts/parts-inventory-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Parts inventory' }

/**
 * Parts inventory page (Spec 2.1).
 *
 * Spec 2.1 promotes `/parts` from a redirect to a real inventory surface.
 * The legacy `/parts/library` (localStorage-backed) and `/mechanic?tab=parts`
 * (parts ordering) continue to work as separate UIs — this page is the
 * DB-backed source of truth going forward.
 */
export default async function PartsPage() {
  // Phase 18 Sprint 18.4 — shop/admin-only route (closes Phase 15 F2)
  const guard = await requirePersona(['shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Parts' }]} />
      <main className="flex-1 overflow-y-auto">
        <PartsInventoryView userRole={membership.role as OrgRole} />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="inventory_parts" /></div>
      </main>
    </div>
  )
}
