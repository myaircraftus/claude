import { Dashboard } from '@/components/redesign/Dashboard'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  await requireAppServerSession()

  return <Dashboard />
}
