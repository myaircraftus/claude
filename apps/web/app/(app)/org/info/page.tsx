import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { OrgInfoView } from './org-info-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Organization Info' }

export default async function OrgInfoPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Info' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <OrgInfoView canWrite={['owner', 'admin'].includes(membership.role)} />
      </main>
    </div>
  )
}
