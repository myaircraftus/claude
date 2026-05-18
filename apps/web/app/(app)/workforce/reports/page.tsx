import { redirect } from 'next/navigation'
import { getWorkforceContext } from '@/lib/workforce/context'
import { Topbar } from '@/components/shared/topbar'

export const metadata = { title: 'Workforce Reports' }

// SOP-WRK-001 §11 — placeholder; replaced by the real Reports module.
export default async function WorkforceReportsPage() {
  const ctx = await getWorkforceContext()
  // SOP §11 — mechanics cannot access Reports at all.
  if (!ctx.canViewReports) redirect('/workforce/dashboard')
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={ctx.profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Reports' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-foreground">Workforce Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">This module is being built.</p>
        </div>
      </main>
    </div>
  )
}
