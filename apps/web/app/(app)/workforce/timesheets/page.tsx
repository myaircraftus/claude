/**
 * SOP-WRK-001 §8 — Timesheets.
 *
 * Weekly payable-labor review. Hours are derived live from clock_events
 * (computeWeekRollup); workflow status comes from workforce_timesheets.
 * Mechanics see only their own week and may submit it; managers/admins/
 * payroll see every employee and may approve (never their own — enforced in
 * the API). Overtime is shown transparently (OT = hours over 40/week).
 */
import Link from '@/components/shared/tenant-link'
import { Topbar } from '@/components/shared/topbar'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { getWorkforceContext } from '@/lib/workforce/context'
import { computeWeekRollup, mondayOf, weekRange, round2 } from '@/lib/workforce/timesheets'
import { SubmitTimesheetButton, ApproveTimesheetButton } from './timesheet-actions'

export const metadata = { title: 'Timesheets' }
export const dynamic = 'force-dynamic'

type Status = 'draft' | 'submitted' | 'approved' | 'exported'
const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Draft' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
  { id: 'exported', label: 'Exported' },
]

function shiftWeek(weekStart: string, deltaDays: number): string {
  const d = new Date(`${weekStart}T00:00:00`)
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}
function fmt(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    submitted: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    exported: 'bg-slate-100 text-slate-700 border-slate-300',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status]}`}>
      {status}
    </span>
  )
}

export default async function WorkforceTimesheetsPage({
  searchParams,
}: {
  searchParams: { week?: string; status?: string }
}) {
  const ctx = await getWorkforceContext()
  const { supabase, organizationId, user } = ctx
  const isMechanic = ctx.workforceRole === 'mechanic'

  const weekStart = mondayOf(searchParams.week)
  const { weekEnd } = weekRange(weekStart)
  const statusFilter = searchParams.status ?? 'all'

  // Hours derived live from clock_events; workflow status from timesheets.
  const rollups = await computeWeekRollup(
    supabase,
    organizationId,
    weekStart,
    isMechanic ? user.id : undefined,
  )

  const { data: tsRows } = await supabase
    .from('workforce_timesheets')
    .select('employee_id, status')
    .eq('organization_id', organizationId)
    .eq('week_start', weekStart)
  const statusByEmployee = new Map<string, Status>()
  for (const r of (tsRows ?? []) as Array<{ employee_id: string; status: Status }>) {
    statusByEmployee.set(r.employee_id, r.status)
  }

  // Resolve names.
  const ids = rollups.map((r) => r.employee_id)
  const nameById = new Map<string, string>()
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', ids)
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      nameById.set(p.id, p.full_name || p.email || 'Employee')
    }
  }

  const rows = rollups
    .map((r) => ({
      ...r,
      name: nameById.get(r.employee_id) ?? 'Employee',
      status: statusByEmployee.get(r.employee_id) ?? ('draft' as Status),
    }))
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .sort((a, b) => a.name.localeCompare(b.name))

  const prevWeek = shiftWeek(weekStart, -7)
  const nextWeek = shiftWeek(weekStart, 7)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={ctx.profile}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Timesheets' }]}
        actions={
          ctx.canExportPayroll ? (
            <a
              href={`/api/workforce/timesheets?week=${weekStart}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/50"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </a>
          ) : undefined
        }
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
            <p className="text-muted-foreground text-sm">
              {isMechanic
                ? 'Review and submit your weekly hours.'
                : 'Review and approve payable labor for the week.'}
            </p>
          </div>

          {/* Week nav + status filter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={`/workforce/timesheets?week=${prevWeek}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/50"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <span className="text-[13px] font-medium text-foreground tabular-nums">
                {fmt(weekStart)} – {fmt(weekEnd)}
              </span>
              <Link
                href={`/workforce/timesheets?week=${nextWeek}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card hover:bg-muted/50"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.id}
                  href={`/workforce/timesheets?week=${weekStart}${f.id !== 'all' ? `&status=${f.id}` : ''}`}
                  className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    statusFilter === f.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Employee</th>
                  <th className="px-4 py-3 text-right font-medium">Regular</th>
                  <th className="px-4 py-3 text-right font-medium">Overtime</th>
                  <th className="px-4 py-3 text-right font-medium">Billable</th>
                  <th className="px-4 py-3 text-left font-medium">Exceptions</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                      No timesheets for this week.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const canApproveThis =
                      ctx.canApproveTimesheets &&
                      r.employee_id !== user.id &&
                      r.status === 'submitted'
                    const canSubmitThis =
                      r.employee_id === user.id && (r.status === 'draft')
                    return (
                      <tr key={r.employee_id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{round2(r.regular_hours).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.overtime_hours > 0 ? (
                            <span className="text-amber-700 font-medium">{round2(r.overtime_hours).toFixed(2)}</span>
                          ) : (
                            <span className="text-muted-foreground">0.00</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{round2(r.billable_hours).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          {r.overtime_hours > 0 ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                              OT threshold
                            </span>
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                        <td className="px-4 py-3 text-right">
                          {canApproveThis ? (
                            <ApproveTimesheetButton employeeId={r.employee_id} weekStart={weekStart} />
                          ) : canSubmitThis ? (
                            <SubmitTimesheetButton weekStart={weekStart} />
                          ) : (
                            <span className="text-[12px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Hours are computed live from clock entries. Overtime = hours over 40 in the week.
            Submitting or approving a timesheet is recorded in the workforce audit log.
          </p>
        </div>
      </main>
    </div>
  )
}
