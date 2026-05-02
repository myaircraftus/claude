import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { VendorsView } from '@/components/vendors/vendors-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Vendors' }

/**
 * Vendors page (Spec 2.2). Vendor master list. Back-references parts
 * inventory (068), purchase orders (068), and outside-service WO lines
 * (016).
 */
export default async function VendorsPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Vendors' }]} />
      <main className="flex-1 overflow-y-auto">
        <VendorsView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
