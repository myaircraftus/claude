import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ProfileView } from './profile-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Profile' }

export default async function ProfilePage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Profile' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <ProfileView membershipId={membership.organization_id} />
      </main>
    </div>
  )
}
