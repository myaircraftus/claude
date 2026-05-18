/**
 * SOP-WRK-001 §11 — Workforce Reports landing.
 *
 * A grid of report-type cards. Mechanics cannot reach Reports at all
 * (getWorkforceContext + the canViewReports gate). The Audit Report is shown
 * only to roles allowed to view the audit trail.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ArrowRight, BarChart2 } from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import { getWorkforceContext } from '@/lib/workforce/context'
import { REPORT_DEFS } from '@/lib/workforce/reports'

export const metadata = { title: 'Workforce Reports' }
export const dynamic = 'force-dynamic'

export default async function WorkforceReportsPage() {
  const ctx = await getWorkforceContext()
  // SOP §11 — mechanics cannot access Reports.
  if (!ctx.canViewReports) redirect('/workforce/dashboard')

  const defs = REPORT_DEFS.filter((d) => !d.auditGated || ctx.canViewAudit)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={ctx.profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Reports' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workforce Reports</h1>
            <p className="text-muted-foreground text-sm">
              Labor intelligence — hours, overtime, utilization, and the audit trail.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defs.map((d) => (
              <Link
                key={d.id}
                href={`/workforce/reports/${d.id}`}
                className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                      <BarChart2 className="h-4 w-4 text-blue-700" />
                    </span>
                    <span className="text-[13.5px] font-bold text-foreground">{d.label}</span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-1.5 text-[11.5px] text-muted-foreground">{d.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
