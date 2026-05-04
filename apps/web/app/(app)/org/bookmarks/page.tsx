import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { BookmarksView } from './bookmarks-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Pinned' }

export default async function BookmarksPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Pinned' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <BookmarksView />
      </main>
    </div>
  )
}
