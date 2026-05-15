import { AircraftWorkspaceList } from '@/components/aircraft/aircraft-workspace-list'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Aircraft' }

export default async function AircraftPage() {
  await requireAppServerSession()

  return <AircraftWorkspaceList />
}
