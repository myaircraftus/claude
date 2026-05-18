import { getWorkforceContext } from '@/lib/workforce/context'
import { Topbar } from '@/components/shared/topbar'

export const metadata = { title: 'Team' }

// SOP-WRK-001 §10 — placeholder; replaced by the real Team directory.
export default async function WorkforceTeamPage() {
  const { profile } = await getWorkforceContext()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Team' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">This module is being built.</p>
        </div>
      </main>
    </div>
  )
}
