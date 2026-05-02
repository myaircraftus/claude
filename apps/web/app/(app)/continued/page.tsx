import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ContinuedItemsPageView } from '@/components/continued/continued-page-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Continued Items' }

/**
 * Continued Items page (Spec 1.4) — whole-org dashboard for deferred
 * maintenance. Per-aircraft sub-route lives at /aircraft/[id]/continued.
 */
export default async function ContinuedItemsPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Continued Items' }]} />
      <main className="flex-1 overflow-y-auto">
        <ContinuedItemsPageView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
