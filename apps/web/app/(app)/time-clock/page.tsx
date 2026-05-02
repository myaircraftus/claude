import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TimeClockOverview } from '@/components/timeclock/time-clock-overview'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Time clock' }

/**
 * Org-wide time clock dashboard (Spec 2.3). Shows the user's current
 * state + currently-running entries across the org + recent closed
 * entries. Per-WO time-clock UI lives at /work-orders/[id]/time-clock.
 */
export default async function TimeClockPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Time clock' }]} />
      <main className="flex-1 overflow-y-auto">
        <TimeClockOverview userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
