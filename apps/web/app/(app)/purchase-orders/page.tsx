import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { PurchaseOrdersView } from '@/components/parts/pos-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Purchase orders' }

/**
 * PurchaseOrdersPage (Spec 2.1) — operator-side PO list with create flow.
 * Per-PO detail (header transitions + per-line receive form) lives at
 * /purchase-orders/[id].
 */
export default async function PurchaseOrdersListPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Purchase orders' }]} />
      <main className="flex-1 overflow-y-auto">
        <PurchaseOrdersView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
