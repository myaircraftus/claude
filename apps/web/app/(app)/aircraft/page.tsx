import { AircraftList } from '@/components/redesign/AircraftList'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'Aircraft' }

export default async function AircraftPage() {
  await requireAppServerSession()

  return <AircraftList />
}
