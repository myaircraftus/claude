import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { MeterProfilesView } from '@/components/meters/meter-profiles-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Meter profiles' }

/**
 * Meter profiles page (Spec 1.1).
 *
 * Lists meter profiles + their meter definitions. Mechanic+ can create
 * and delete; viewers/auditors/pilots see a read-only list.
 *
 * Per-aircraft meter UI lives at /(app)/aircraft/[id]/meters/page.tsx.
 */
export default async function MetersPage() {
  const { profile, membership } = await requireAppServerSession()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Meters' }]} />
      <main className="flex-1 overflow-y-auto">
        <MeterProfilesView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
