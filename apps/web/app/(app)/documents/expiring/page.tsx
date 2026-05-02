import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ExpiringDocsView } from './expiring-view'

export const metadata = { title: 'Expiring Documents' }

export default async function ExpiringDocumentsPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: 'Expiring' }]}
      />
      <main className="flex-1 overflow-hidden">
        <ExpiringDocsView />
      </main>
    </div>
  )
}
