/**
 * SOP-WRK-001 §11 — Workforce report engine.
 *
 * Each report is a group-by aggregation over real workforce data (clock_events,
 * shifts, time_off_requests, workforce_audit_events) for a date range. runReport
 * returns a generic { columns, rows } table consumed by both the report page
 * and the CSV export route.
 */
import { OT_WEEKLY_THRESHOLD } from './timesheets'

export type ReportCell = string | number
export interface ReportResult {
  columns: string[]
  rows: ReportCell[][]
}

export interface ReportDef {
  id: string
  label: string
  description: string
  /** Requires the audit-viewing role set (admin / payroll_admin / auditor). */
  auditGated?: boolean
}

export const REPORT_DEFS: ReportDef[] = [
  { id: 'payroll-summary', label: 'Payroll Summary', description: 'Regular, overtime, billable and non-billable hours per employee.' },
  { id: 'attendance', label: 'Attendance', description: 'Days present and clock entries per employee.' },
  { id: 'overtime', label: 'Overtime', description: 'Employees over the 40-hour weekly threshold.' },
  { id: 'labor-utilization', label: 'Labor Utilization', description: 'Billable vs non-billable ratio per employee.' },
  { id: 'labor-by-employee', label: 'Labor by Employee', description: 'Total hours and entries per employee.' },
  { id: 'labor-by-work-order', label: 'Labor by Work Order', description: 'Hours allocated to each work order.' },
  { id: 'labor-by-aircraft', label: 'Labor by Aircraft', description: 'Total labor hours per aircraft tail number.' },
  { id: 'schedule-coverage', label: 'Schedule Coverage', description: 'Scheduled shifts vs actual clock-ins by day.' },
  { id: 'time-off', label: 'Time Off', description: 'Time-off requests, types and approval status.' },
  { id: 'audit', label: 'Audit Report', description: 'Every workforce manual edit — who, what, when, why.', auditGated: true },
]

export function reportDef(id: string): ReportDef | undefined {
  return REPORT_DEFS.find((r) => r.id === id)
}

function n2(n: number): number {
  return Math.round(n * 100) / 100
}

async function resolveNames(
  supabase: any,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return map
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', unique)
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    map.set(p.id, p.full_name || p.email || 'Employee')
  }
  return map
}

/**
 * Run a workforce report. `fromIso`/`toIso` bound the period. Returns a
 * generic table. Scoped to the org (callers also pass an org-scoped client).
 */
export async function runReport(
  supabase: any,
  organizationId: string,
  type: string,
  fromIso: string,
  toIso: string,
): Promise<ReportResult> {
  // ── audit ─────────────────────────────────────────────────────────────────
  if (type === 'audit') {
    const { data } = await supabase
      .from('workforce_audit_events')
      .select('actor_user_id, entity_type, action, reason, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(500)
    const events = (data ?? []) as Array<{
      actor_user_id: string | null; entity_type: string; action: string; reason: string | null; created_at: string
    }>
    const names = await resolveNames(supabase, events.map((e) => e.actor_user_id ?? ''))
    return {
      columns: ['When', 'Actor', 'Entity', 'Action', 'Reason'],
      rows: events.map((e) => [
        new Date(e.created_at).toLocaleString(),
        e.actor_user_id ? names.get(e.actor_user_id) ?? 'Unknown' : 'System',
        e.entity_type,
        e.action,
        e.reason ?? '',
      ]),
    }
  }

  // ── time-off ──────────────────────────────────────────────────────────────
  if (type === 'time-off') {
    const fromDate = fromIso.slice(0, 10)
    const toDate = toIso.slice(0, 10)
    const { data } = await supabase
      .from('time_off_requests')
      .select('employee_id, request_type, start_date, end_date, status, total_days')
      .eq('organization_id', organizationId)
      .gte('end_date', fromDate)
      .lte('start_date', toDate)
      .order('start_date', { ascending: true })
    const reqs = (data ?? []) as Array<{
      employee_id: string; request_type: string; start_date: string; end_date: string; status: string; total_days: number | null
    }>
    const names = await resolveNames(supabase, reqs.map((r) => r.employee_id))
    return {
      columns: ['Employee', 'Type', 'Start', 'End', 'Days', 'Status'],
      rows: reqs.map((r) => [
        names.get(r.employee_id) ?? 'Employee',
        r.request_type,
        r.start_date,
        r.end_date,
        r.total_days != null ? Number(r.total_days) : '',
        r.status,
      ]),
    }
  }

  // ── schedule-coverage ─────────────────────────────────────────────────────
  if (type === 'schedule-coverage') {
    const [shiftsR, clockR] = await Promise.all([
      supabase.from('shifts').select('start_time').eq('organization_id', organizationId)
        .gte('start_time', fromIso).lt('start_time', toIso),
      supabase.from('clock_events').select('clock_in_at').eq('organization_id', organizationId)
        .gte('clock_in_at', fromIso).lt('clock_in_at', toIso),
    ])
    const byDay = new Map<string, { scheduled: number; actual: number }>()
    for (const s of (shiftsR.data ?? []) as Array<{ start_time: string }>) {
      const d = s.start_time.slice(0, 10)
      const c = byDay.get(d) ?? { scheduled: 0, actual: 0 }
      c.scheduled++; byDay.set(d, c)
    }
    for (const e of (clockR.data ?? []) as Array<{ clock_in_at: string }>) {
      const d = e.clock_in_at.slice(0, 10)
      const c = byDay.get(d) ?? { scheduled: 0, actual: 0 }
      c.actual++; byDay.set(d, c)
    }
    return {
      columns: ['Date', 'Scheduled Shifts', 'Actual Clock-Ins'],
      rows: Array.from(byDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, v]) => [d, v.scheduled, v.actual]),
    }
  }

  // ── labor-by-work-order ───────────────────────────────────────────────────
  if (type === 'labor-by-work-order') {
    const { data } = await supabase
      .from('clock_events')
      .select('work_order_id, total_hours, billable_status')
      .eq('organization_id', organizationId)
      .gte('clock_in_at', fromIso).lt('clock_in_at', toIso)
      .not('work_order_id', 'is', null)
    const byWo = new Map<string, { hours: number; billable: number }>()
    for (const r of (data ?? []) as Array<{ work_order_id: string; total_hours: number | null; billable_status: string | null }>) {
      const hrs = Number(r.total_hours ?? 0)
      const c = byWo.get(r.work_order_id) ?? { hours: 0, billable: 0 }
      c.hours += hrs
      if (r.billable_status === 'billable') c.billable += hrs
      byWo.set(r.work_order_id, c)
    }
    const woIds = Array.from(byWo.keys())
    const woLabel = new Map<string, string>()
    if (woIds.length) {
      const { data: wos } = await supabase
        .from('work_orders').select('id, work_order_number').in('id', woIds)
      for (const w of (wos ?? []) as Array<{ id: string; work_order_number: string | null }>) {
        woLabel.set(w.id, w.work_order_number || w.id.slice(0, 8))
      }
    }
    return {
      columns: ['Work Order', 'Total Hours', 'Billable Hours'],
      rows: Array.from(byWo.entries()).map(([id, v]) => [
        woLabel.get(id) ?? id.slice(0, 8), n2(v.hours), n2(v.billable),
      ]),
    }
  }

  // ── labor-by-aircraft ─────────────────────────────────────────────────────
  if (type === 'labor-by-aircraft') {
    const { data } = await supabase
      .from('clock_events')
      .select('aircraft_id, total_hours')
      .eq('organization_id', organizationId)
      .gte('clock_in_at', fromIso).lt('clock_in_at', toIso)
      .not('aircraft_id', 'is', null)
    const byAc = new Map<string, number>()
    for (const r of (data ?? []) as Array<{ aircraft_id: string; total_hours: number | null }>) {
      byAc.set(r.aircraft_id, (byAc.get(r.aircraft_id) ?? 0) + Number(r.total_hours ?? 0))
    }
    const acIds = Array.from(byAc.keys())
    const acLabel = new Map<string, string>()
    if (acIds.length) {
      const { data: acs } = await supabase.from('aircraft').select('id, tail_number').in('id', acIds)
      for (const a of (acs ?? []) as Array<{ id: string; tail_number: string }>) {
        acLabel.set(a.id, a.tail_number)
      }
    }
    return {
      columns: ['Aircraft', 'Total Hours'],
      rows: Array.from(byAc.entries()).map(([id, h]) => [acLabel.get(id) ?? id.slice(0, 8), n2(h)]),
    }
  }

  // ── clock_events-per-employee reports (payroll / attendance / overtime /
  //    utilization / labor-by-employee all share this base query) ────────────
  const { data: ceData } = await supabase
    .from('clock_events')
    .select('employee_id, total_hours, billable_status, clock_in_at')
    .eq('organization_id', organizationId)
    .gte('clock_in_at', fromIso).lt('clock_in_at', toIso)
  const ce = (ceData ?? []) as Array<{
    employee_id: string; total_hours: number | null; billable_status: string | null; clock_in_at: string
  }>

  interface Agg {
    total: number; billable: number; nonBillable: number; entries: number; days: Set<string>
  }
  const byEmp = new Map<string, Agg>()
  for (const r of ce) {
    const a = byEmp.get(r.employee_id) ??
      { total: 0, billable: 0, nonBillable: 0, entries: 0, days: new Set<string>() }
    const hrs = Number(r.total_hours ?? 0)
    a.total += hrs
    if (r.billable_status === 'billable') a.billable += hrs
    else a.nonBillable += hrs
    a.entries += 1
    a.days.add(r.clock_in_at.slice(0, 10))
    byEmp.set(r.employee_id, a)
  }
  const names = await resolveNames(supabase, Array.from(byEmp.keys()))
  const list = Array.from(byEmp.entries())
    .map(([id, a]) => ({ name: names.get(id) ?? 'Employee', ...a }))
    .sort((x, y) => x.name.localeCompare(y.name))

  if (type === 'attendance') {
    return {
      columns: ['Employee', 'Days Present', 'Clock Entries'],
      rows: list.map((e) => [e.name, e.days.size, e.entries]),
    }
  }
  if (type === 'overtime') {
    return {
      columns: ['Employee', 'Total Hours', 'Overtime Hours'],
      rows: list
        .filter((e) => e.total > OT_WEEKLY_THRESHOLD)
        .map((e) => [e.name, n2(e.total), n2(e.total - OT_WEEKLY_THRESHOLD)]),
    }
  }
  if (type === 'labor-by-employee') {
    return {
      columns: ['Employee', 'Total Hours', 'Clock Entries'],
      rows: list.map((e) => [e.name, n2(e.total), e.entries]),
    }
  }
  if (type === 'labor-utilization') {
    return {
      columns: ['Employee', 'Billable Hours', 'Non-Billable Hours', 'Billable %'],
      rows: list.map((e) => [
        e.name, n2(e.billable), n2(e.nonBillable),
        e.total > 0 ? `${Math.round((e.billable / e.total) * 100)}%` : '0%',
      ]),
    }
  }
  // default → payroll-summary
  return {
    columns: ['Employee', 'Regular Hours', 'Overtime Hours', 'Billable Hours', 'Non-Billable Hours'],
    rows: list.map((e) => [
      e.name,
      n2(Math.min(e.total, OT_WEEKLY_THRESHOLD)),
      n2(Math.max(0, e.total - OT_WEEKLY_THRESHOLD)),
      n2(e.billable),
      n2(e.nonBillable),
    ]),
  }
}
