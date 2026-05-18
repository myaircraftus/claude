/**
 * SOP-WRK-001 §8 — timesheet rollup logic.
 *
 * A timesheet is a weekly view of payable labor DERIVED from clock_events
 * (the daily clock in/out — the SOP's "time entries"). workforce_timesheets
 * stores the reviewed status + the hours snapshot taken at submit/approve.
 *
 * Overtime is transparent (SOP §14 #6): OT = hours over 40 in the week.
 */

/** A weekly hours rollup for one employee. */
export interface WeekRollup {
  employee_id: string
  total_hours: number
  regular_hours: number
  overtime_hours: number
  billable_hours: number
  non_billable_hours: number
}

/** Weekly overtime threshold (SOP §8.2 — default 40 hrs/week). */
export const OT_WEEKLY_THRESHOLD = 40

/** Monday (YYYY-MM-DD) of the week containing `dateStr` (or today). */
export function mondayOf(dateStr?: string): string {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date()
  if (Number.isNaN(d.getTime())) return mondayOf()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - dow)
  return d.toISOString().slice(0, 10)
}

/** ISO bounds for a week starting at `weekStart` (YYYY-MM-DD). */
export function weekRange(weekStart: string): {
  startIso: string
  endIso: string
  weekEnd: string
} {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const weekEndD = new Date(start)
  weekEndD.setDate(weekEndD.getDate() + 6)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekEnd: weekEndD.toISOString().slice(0, 10),
  }
}

/**
 * Compute per-employee weekly rollups from clock_events. Scoped to the org;
 * optionally narrowed to a single employee (the mechanic self-service view).
 */
export async function computeWeekRollup(
  supabase: any,
  organizationId: string,
  weekStart: string,
  employeeId?: string,
): Promise<WeekRollup[]> {
  const { startIso, endIso } = weekRange(weekStart)
  let q = supabase
    .from('clock_events')
    .select('employee_id, total_hours, billable_status')
    .eq('organization_id', organizationId)
    .gte('clock_in_at', startIso)
    .lt('clock_in_at', endIso)
  if (employeeId) q = q.eq('employee_id', employeeId)

  const { data } = await q
  const byEmp = new Map<string, WeekRollup>()
  for (const r of (data ?? []) as Array<{
    employee_id: string
    total_hours: number | null
    billable_status: string | null
  }>) {
    const hrs = Number(r.total_hours ?? 0)
    const cur =
      byEmp.get(r.employee_id) ??
      {
        employee_id: r.employee_id,
        total_hours: 0,
        regular_hours: 0,
        overtime_hours: 0,
        billable_hours: 0,
        non_billable_hours: 0,
      }
    cur.total_hours += hrs
    if (r.billable_status === 'billable') cur.billable_hours += hrs
    else cur.non_billable_hours += hrs
    byEmp.set(r.employee_id, cur)
  }
  for (const v of byEmp.values()) {
    v.regular_hours = Math.min(v.total_hours, OT_WEEKLY_THRESHOLD)
    v.overtime_hours = Math.max(0, v.total_hours - OT_WEEKLY_THRESHOLD)
  }
  return Array.from(byEmp.values())
}

/** Round to 2dp for display / storage. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
