import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { DirectoryView } from './directory-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Directory' }

export default async function DirectoryPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Directory' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
        <DirectoryView />
      </main>
    </div>
  )
}
