import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TrashView } from './trash-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Trash' }

export default async function TrashPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Trash' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <TrashView canPurge={['owner', 'admin'].includes(membership.role)} />
      </main>
    </div>
  )
}
