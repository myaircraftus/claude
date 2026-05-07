import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { CostsView } from './costs-view'
import { EntityBulkPanel } from '@/components/bulk/EntityBulkPanel'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Costs' }

/**
 * /(app)/costs (Spec 7.1) — Operating Cost ledger.
 *
 * Per-aircraft / per-category list with manual entry. Foundation for the
 * Phase 7 P&L surfaces; sprint 7.2 layers AI receipt intake on top.
 */
export default async function CostsPage() {
  const { profile } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Costs' }]} />
      <main className="flex-1 overflow-y-auto">
        <CostsView />
        {/* Spec polish.bulk-ui-rollout — multi-select + bulk patch panel. */}
        <div className="px-6 pb-6 max-w-4xl mx-auto"><EntityBulkPanel entityType="cost_entries" /></div>
      </main>
    </div>
  )
}
