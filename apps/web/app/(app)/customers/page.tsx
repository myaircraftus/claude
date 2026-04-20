import { CustomersPage } from '@/components/redesign/CustomersPage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Customers' }

export default async function CustomersRoute() {
  await requireAppServerSession()

  return <CustomersPage />
}
