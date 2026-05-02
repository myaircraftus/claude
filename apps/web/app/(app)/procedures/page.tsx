import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ProceduresView } from '@/components/inspections/procedures-view'
import type { OrgRole } from '@/types'

export const metadata = { title: 'Procedures' }

/**
 * Procedures library page (Spec 1.3). Mechanic+ creates / archives
 * procedures here; viewers see a read-only list. Editing a single
 * procedure happens at /procedures/[id].
 */
export default async function ProceduresPage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Procedures' }]} />
      <main className="flex-1 overflow-y-auto">
        <ProceduresView userRole={membership.role as OrgRole} />
      </main>
    </div>
  )
}
