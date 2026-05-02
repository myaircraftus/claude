import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ToolsView } from './tools-view'

export const metadata = { title: 'Tools' }

export default async function ToolsPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Tools' }]} />
      <main className="flex-1 overflow-hidden">
        <ToolsView />
      </main>
    </div>
  )
}
