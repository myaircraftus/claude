import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { InviteView } from './invite-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invite Member' }

export default async function InvitePage() {
  const { profile, membership } = await requireAppServerSession()
  if (!['owner', 'admin'].includes(membership.role)) redirect('/org/directory')
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Org', href: '/org' }, { label: 'Directory', href: '/org/directory' }, { label: 'Invite' }]} />
      <main className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
        <InviteView />
      </main>
    </div>
  )
}
