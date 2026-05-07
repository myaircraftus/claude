import { CustomersPage } from '@/components/redesign/CustomersPage'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Customers' }

export default async function CustomersRoute() {
  await requireAppServerSession()

  return (
    <>
      <CustomersPage />
      {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
      <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="customers" /></div>
    </>
  )
}
