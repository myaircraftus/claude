import { WorkOrdersPage } from '@/components/redesign/WorkOrdersPage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Work Orders' }

export default async function WorkOrdersRoute() {
  await requireAppServerSession()

  return <WorkOrdersPage />
}
