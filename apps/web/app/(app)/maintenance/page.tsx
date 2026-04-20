import { MaintenancePage } from '@/components/redesign/MaintenancePage'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Maintenance' }

export default async function MaintenanceRoute() {
  await requireAppServerSession()

  return <MaintenancePage />
}
