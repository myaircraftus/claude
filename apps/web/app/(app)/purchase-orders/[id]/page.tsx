import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { PurchaseOrderDetail } from '@/components/parts/po-detail'
import { createServerSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Purchase order' }

/**
 * Per-PO detail page (Spec 2.1). Mounts PurchaseOrderDetail — operator
 * sees the PO header, status pills, line-by-line receive form, and the
 * "Fulfill all" shortcut. The fulfill flow increments inventory.qty_on_hand
 * via the shared restockInventoryPart helper (lib/inventory/consume.ts).
 */
export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('purchase_orders')
    .select('id, po_number')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!data) redirect('/purchase-orders')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Purchase orders', href: '/purchase-orders' },
          { label: (data as { po_number: string }).po_number },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <PurchaseOrderDetail poId={params.id} userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
