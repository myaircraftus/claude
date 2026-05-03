import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { BulkUpdatesView } from './bulk-updates-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bulk Updates' }

export default async function BulkUpdatesPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Bulk Updates' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <BulkUpdatesView />
      </main>
    </div>
  )
}
