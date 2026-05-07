import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ToolsView } from './tools-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'

export const metadata = { title: 'Tools' }

export default async function ToolsPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Tools' }]} />
      <main className="flex-1 overflow-y-auto">
        <ToolsView />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="tools" /></div>
      </main>
    </div>
  )
}
