import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { TaxPnlReportClient } from './tax-pnl-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tax-Time P&L' }

/**
 * /(app)/reports/tax-pnl  (Spec 7.7)
 *
 * Year picker + Generate button. The "history of past reports" surface
 * is currently the browser's download history; a future enhancement
 * would persist generated PDFs to a `generated_reports` table — logged
 * as a 7.7 follow-up. For now the page lists the years that have
 * approved cost_entries on file, so the operator picks from real data.
 */
export default async function TaxPnlPage() {
  const { profile, supabase, membership } = await requireAppServerSession()

  // Years with at least one approved cost_entry — drives the year picker.
  const { data: rows } = await supabase
    .from('cost_entries')
    .select('cost_date')
    .eq('organization_id', membership.organization_id)
    .eq('approved', true)
    .order('cost_date', { ascending: false })
    .limit(2000)

  const yearsWithData = new Set<number>()
  for (const r of (rows ?? [])) {
    const d = (r as { cost_date: string }).cost_date
    if (typeof d === 'string' && d.length >= 4) {
      const y = parseInt(d.slice(0, 4), 10)
      if (Number.isFinite(y)) yearsWithData.add(y)
    }
  }
  const thisYear = new Date().getUTCFullYear()
  // Always include this + last year so the picker isn't empty for new orgs.
  yearsWithData.add(thisYear)
  yearsWithData.add(thisYear - 1)
  const years = Array.from(yearsWithData).sort((a, b) => b - a)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Reports', href: '/reports' },
          { label: 'Tax-time P&L' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <TaxPnlReportClient years={years} />
      </main>
    </div>
  )
}
