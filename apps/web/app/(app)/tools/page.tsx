import { requireAppServerSession } from '@/lib/auth/server-app'
import { redirect } from 'next/navigation'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { ToolsView } from './tools-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'

export const metadata = { title: 'Tools' }

export default async function ToolsPage() {
  // Phase 18 Sprint 18.4 — shop/admin-only route (closes Phase 15 F2)
  const guard = await requirePersona(['shop', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

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
