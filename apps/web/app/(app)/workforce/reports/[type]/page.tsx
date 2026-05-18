/**
 * SOP-WRK-001 §11 — a single workforce report.
 *
 * Runs the report for a date range and renders it as a table, with a date
 * filter and a CSV export link. Mechanics cannot reach Reports; the audit
 * report is additionally gated to the audit-viewing roles.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { Download } from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import { getWorkforceContext } from '@/lib/workforce/context'
import { runReport, reportDef } from '@/lib/workforce/reports'

export const metadata = { title: 'Workforce Report' }
export const dynamic = 'force-dynamic'

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
/** Resolve the [from, to] date range from query params (default: last 14 days). */
function resolveRange(sp: { from?: string; to?: string }): { from: string; to: string } {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const today = new Date()
  const defFrom = new Date(today); defFrom.setDate(defFrom.getDate() - 13)
  const from = sp.from && dateRe.test(sp.from) ? sp.from : isoDate(defFrom)
  const to = sp.to && dateRe.test(sp.to) ? sp.to : isoDate(today)
  return { from, to }
}

export default async function WorkforceReportPage({
  params,
  searchParams,
}: {
  params: { type: string }
  searchParams: { from?: string; to?: string }
}) {
  const ctx = await getWorkforceContext()
  if (!ctx.canViewReports) redirect('/workforce/dashboard')

  const def = reportDef(params.type)
  if (!def) redirect('/workforce/reports')
  if (def.auditGated && !ctx.canViewAudit) redirect('/workforce/reports')

  const { from, to } = resolveRange(searchParams)
  const fromIso = new Date(`${from}T00:00:00`).toISOString()
  const toEnd = new Date(`${to}T00:00:00`)
  toEnd.setDate(toEnd.getDate() + 1)
  const toIso = toEnd.toISOString()

  const result = await runReport(ctx.supabase, ctx.organizationId, def.id, fromIso, toIso)
  const csvHref = `/api/workforce/reports?type=${def.id}&from=${from}&to=${to}`

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={ctx.profile}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Reports' }, { label: def.label }]}
        actions={
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div>
            <Link href="/workforce/reports" className="text-[12px] text-primary hover:underline">
              ← All reports
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{def.label}</h1>
            <p className="text-muted-foreground text-sm">{def.description}</p>
          </div>

          {/* Date range filter */}
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From</label>
              <input
                type="date" name="from" defaultValue={from}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">To</label>
              <input
                type="date" name="to" defaultValue={to}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Apply
            </button>
          </form>

          {/* Result table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {result.columns.map((c, i) => (
                    <th key={c} className={`px-4 py-3 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={result.columns.length} className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-muted/30">
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`px-4 py-2.5 ${ci === 0 ? 'text-left font-medium text-foreground' : 'text-right tabular-nums text-foreground'}`}
                        >
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {result.rows.length} {result.rows.length === 1 ? 'row' : 'rows'} · {from} to {to}
          </p>
        </div>
      </main>
    </div>
  )
}
