/**
 * SOP-WRK-001 §5 — Workforce Command Center.
 *
 * Server component. Renders the full admin/manager command center, or a
 * simplified personal dashboard for the mechanic workforce role. All data is
 * fetched server-side, scoped to the shop org (RLS also enforces this).
 */
import Link from '@/components/shared/tenant-link'
import {
  Users, CalendarDays, Timer, Umbrella, Clock3, AlertTriangle,
  Plus, MonitorCheck, CheckSquare, FileSpreadsheet, BarChart2, ArrowRight,
} from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import { getWorkforceContext } from '@/lib/workforce/context'

export const metadata = { title: 'Workforce Dashboard' }
export const dynamic = 'force-dynamic'

// ── date helpers ────────────────────────────────────────────────────────────
function dayBounds(d = new Date()): { start: string; end: string } {
  const start = new Date(d); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
/** Monday 00:00 of the current week → next Monday. */
function weekBounds(d = new Date()): { start: string; end: string; startDate: Date } {
  const start = new Date(d); start.setHours(0, 0, 0, 0)
  const dow = (start.getDay() + 6) % 7 // 0 = Monday
  start.setDate(start.getDate() - dow)
  const end = new Date(start); end.setDate(end.getDate() + 7)
  return { start: start.toISOString(), end: end.toISOString(), startDate: start }
}
function hhmm(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function rangeLabel(start: string, end: string): string {
  const s = new Date(start), e = new Date(end)
  const f = (x: Date) => x.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${f(s)} – ${f(e)}`
}

const JOB_TYPE_COLOR: Record<string, string> = {
  maintenance: 'bg-emerald-100 text-emerald-800',
  inspection: 'bg-blue-100 text-blue-800',
  avionics: 'bg-indigo-100 text-indigo-800',
  fabrication: 'bg-amber-100 text-amber-800',
  parts: 'bg-pink-100 text-pink-800',
}
function jobColor(t: string | null | undefined): string {
  return (t && JOB_TYPE_COLOR[t.toLowerCase()]) || 'bg-slate-100 text-slate-700'
}

// ── small UI pieces ─────────────────────────────────────────────────────────
function MetricCard({
  icon, label, value, sub, accent,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ?? 'bg-blue-50'}`}>
          {icon}
        </div>
        <p className="text-[12px] text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-[28px] font-bold leading-none text-foreground tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ClockStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    'clocked-in': 'bg-green-50 text-green-700 border-green-200',
    'on-break': 'bg-amber-50 text-amber-700 border-amber-200',
    'clocked-out': 'bg-slate-100 text-slate-600 border-slate-200',
  }
  const label: Record<string, string> = {
    'clocked-in': 'On clock', 'on-break': 'On break', 'clocked-out': 'Clocked out',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${map[status] ?? map['clocked-out']}`}>
      {label[status] ?? status}
    </span>
  )
}

interface Punch { id: string; employee_id: string; status: string; clock_in_at: string; clock_out_at: string | null }
interface ShiftRow {
  id: string; technician_id: string; name: string; start_time: string; end_time: string; job_type: string | null
}
interface TimeOffRow {
  id: string; employee_id: string; request_type: string; start_date: string; end_date: string; status: string
}

export default async function WorkforceDashboardPage() {
  const ctx = await getWorkforceContext()
  const { supabase, organizationId, user } = ctx
  const today = dayBounds()
  const week = weekBounds()
  const isMechanic = ctx.workforceRole === 'mechanic'

  // ── fetch (scoped to org; mechanic view additionally filters to self) ──────
  const shiftsQ = supabase
    .from('shifts')
    .select('id, technician_id, name, start_time, end_time, job_type')
    .eq('organization_id', organizationId)
    .gte('start_time', today.start)
    .lt('start_time', today.end)
    .order('start_time', { ascending: true })

  const onClockQ = supabase
    .from('clock_events')
    .select('id, employee_id, status, clock_in_at, clock_out_at')
    .eq('organization_id', organizationId)
    .is('clock_out_at', null)

  const recentPunchesQ = supabase
    .from('clock_events')
    .select('id, employee_id, status, clock_in_at, clock_out_at')
    .eq('organization_id', organizationId)
    .order('clock_in_at', { ascending: false })
    .limit(5)

  const weekClockQ = supabase
    .from('clock_events')
    .select('employee_id, total_hours')
    .eq('organization_id', organizationId)
    .gte('clock_in_at', week.start)
    .lt('clock_in_at', week.end)

  const timeOffPendingQ = supabase
    .from('time_off_requests')
    .select('id, employee_id, request_type, start_date, end_date, status')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('start_date', { ascending: true })

  const upcomingTimeOffQ = supabase
    .from('time_off_requests')
    .select('id, employee_id, request_type, start_date, end_date, status')
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'approved'])
    .gte('end_date', new Date().toISOString().slice(0, 10))
    .order('start_date', { ascending: true })
    .limit(5)

  const [shiftsR, onClockR, recentR, weekClockR, toPendingR, toUpcomingR] = await Promise.all([
    isMechanic ? shiftsQ.eq('technician_id', user.id) : shiftsQ,
    isMechanic ? onClockQ.eq('employee_id', user.id) : onClockQ,
    isMechanic ? recentPunchesQ.eq('employee_id', user.id) : recentPunchesQ,
    isMechanic ? weekClockQ.eq('employee_id', user.id) : weekClockQ,
    isMechanic ? timeOffPendingQ.eq('employee_id', user.id) : timeOffPendingQ,
    isMechanic ? upcomingTimeOffQ.eq('employee_id', user.id) : upcomingTimeOffQ,
  ])

  const shifts = (shiftsR.data ?? []) as ShiftRow[]
  const onClock = (onClockR.data ?? []) as Punch[]
  const recentPunches = (recentR.data ?? []) as Punch[]
  const weekClock = (weekClockR.data ?? []) as Array<{ employee_id: string; total_hours: number | null }>
  const pendingTimeOff = (toPendingR.data ?? []) as TimeOffRow[]
  const upcomingTimeOff = (toUpcomingR.data ?? []) as TimeOffRow[]

  // ── resolve employee names ────────────────────────────────────────────────
  const userIds = Array.from(new Set([
    ...shifts.map((s) => s.technician_id),
    ...recentPunches.map((p) => p.employee_id),
    ...onClock.map((p) => p.employee_id),
    ...pendingTimeOff.map((t) => t.employee_id),
    ...upcomingTimeOff.map((t) => t.employee_id),
  ].filter(Boolean)))
  const nameById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      nameById.set(p.id, p.full_name || p.email || 'Employee')
    }
  }
  const nameOf = (id: string) => nameById.get(id) ?? 'Employee'

  // ── derived metrics ───────────────────────────────────────────────────────
  const hoursByEmployee = new Map<string, number>()
  for (const c of weekClock) {
    hoursByEmployee.set(c.employee_id, (hoursByEmployee.get(c.employee_id) ?? 0) + Number(c.total_hours ?? 0))
  }
  let weekRegular = 0
  let weekOvertime = 0
  for (const hrs of hoursByEmployee.values()) {
    weekRegular += Math.min(hrs, 40)
    weekOvertime += Math.max(0, hrs - 40)
  }
  // OT risk — employees at/over 40h, or projecting past it (>= 36h logged).
  const overtimeRisk = Array.from(hoursByEmployee.values()).filter((h) => h >= 36).length
  const todaysStaff = new Set(shifts.map((s) => s.technician_id)).size

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={ctx.profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Dashboard' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Workforce Command Center</h1>
            <p className="text-muted-foreground text-sm">
              {isMechanic
                ? 'Your schedule, clock, and time off at a glance.'
                : 'Manage schedules, time, and time off in one place.'}
            </p>
          </div>

          {/* ── Metric cards ── */}
          {isMechanic ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={<CalendarDays className="h-4 w-4 text-blue-700" />} label="My Shifts Today" value={shifts.length} />
              <MetricCard
                icon={<Clock3 className="h-4 w-4 text-green-700" />} accent="bg-green-50"
                label="Status"
                value={onClock.length > 0 ? (onClock[0].status === 'on-break' ? 'On break' : 'On clock') : 'Off'}
              />
              <MetricCard
                icon={<Timer className="h-4 w-4 text-indigo-700" />} accent="bg-indigo-50"
                label="My Hours This Week" value={(weekRegular + weekOvertime).toFixed(2)}
                sub={`Reg ${weekRegular.toFixed(2)} · OT ${weekOvertime.toFixed(2)}`}
              />
              <MetricCard
                icon={<Umbrella className="h-4 w-4 text-amber-700" />} accent="bg-amber-50"
                label="My Time Off" value={upcomingTimeOff.length} sub="upcoming requests"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <MetricCard icon={<Users className="h-4 w-4 text-blue-700" />} label="Today's Staff" value={todaysStaff} />
              <MetricCard icon={<CalendarDays className="h-4 w-4 text-indigo-700" />} accent="bg-indigo-50" label="Scheduled Shifts" value={shifts.length} />
              <MetricCard icon={<Clock3 className="h-4 w-4 text-green-700" />} accent="bg-green-50" label="On Clock Now" value={onClock.length} />
              <MetricCard icon={<Umbrella className="h-4 w-4 text-amber-700" />} accent="bg-amber-50" label="Time Off Pending" value={pendingTimeOff.length} />
              <MetricCard
                icon={<Timer className="h-4 w-4 text-blue-700" />} label="Hours This Week"
                value={(weekRegular + weekOvertime).toFixed(2)}
                sub={`Reg ${weekRegular.toFixed(2)} · OT ${weekOvertime.toFixed(2)}`}
              />
              <MetricCard
                icon={<AlertTriangle className="h-4 w-4 text-red-700" />}
                accent={overtimeRisk > 0 ? 'bg-red-50' : 'bg-slate-50'}
                label="Overtime Risk" value={overtimeRisk} sub="employees ≥ 36h"
              />
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Today's Schedule */}
            <section className="lg:col-span-2">
              <h2 className="text-[14px] font-bold text-foreground mb-2">
                {isMechanic ? 'My Schedule Today' : "Today's Schedule"}
              </h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {shifts.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">
                    No shifts scheduled today.
                  </p>
                ) : (
                  shifts.slice(0, 8).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-[12.5px] font-medium text-foreground w-36 truncate">
                        {nameOf(s.technician_id)}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${jobColor(s.job_type)}`}>
                        {s.job_type || s.name || 'Shift'}
                      </span>
                      <span className="ml-auto text-[11.5px] text-muted-foreground tabular-nums">
                        {hhmm(s.start_time)} – {hhmm(s.end_time)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Right column — quick actions + recent punches */}
            <div className="space-y-6">
              <section>
                <h2 className="text-[14px] font-bold text-foreground mb-2">Quick Actions</h2>
                <div className="flex flex-wrap gap-2">
                  {isMechanic ? (
                    <>
                      <QuickAction href="/workforce/clock" icon={<Clock3 className="h-3.5 w-3.5" />} label="Clock In / Out" primary />
                      <QuickAction href="/workforce/time-off" icon={<Umbrella className="h-3.5 w-3.5" />} label="Request Time Off" />
                      <QuickAction href="/workforce/timesheets" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} label="My Timesheet" />
                    </>
                  ) : (
                    <>
                      <QuickAction href="/workforce/scheduler" icon={<Plus className="h-3.5 w-3.5" />} label="Add Shift" primary />
                      <QuickAction href="/workforce/clock" icon={<MonitorCheck className="h-3.5 w-3.5" />} label="Time Clock" />
                      <QuickAction href="/workforce/time-off" icon={<CheckSquare className="h-3.5 w-3.5" />} label="Approve Time Off" />
                      <QuickAction href="/workforce/timesheets" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} label="Timesheets" />
                      {ctx.canViewReports && (
                        <QuickAction href="/workforce/reports" icon={<BarChart2 className="h-3.5 w-3.5" />} label="Run Report" />
                      )}
                    </>
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-[14px] font-bold text-foreground mb-2">Recent Time Clock Activity</h2>
                <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                  {recentPunches.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No punches yet.</p>
                  ) : (
                    recentPunches.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                        <span className="text-[12.5px] text-foreground flex-1 min-w-0 truncate">{nameOf(p.employee_id)}</span>
                        <ClockStatusPill status={p.status} />
                        <span className="text-[11px] text-muted-foreground tabular-nums w-16 text-right">
                          {hhmm(p.clock_out_at ?? p.clock_in_at)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* Upcoming Time Off */}
          <section>
            <h2 className="text-[14px] font-bold text-foreground mb-2">Upcoming Time Off</h2>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {upcomingTimeOff.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-muted-foreground">No upcoming time off.</p>
              ) : (
                upcomingTimeOff.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[12.5px] font-medium text-foreground w-36 truncate">{nameOf(t.employee_id)}</span>
                    <span className="text-[11.5px] text-muted-foreground">{rangeLabel(t.start_date, t.end_date)}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{t.request_type}</span>
                    <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      t.status === 'approved'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          {!isMechanic && (
            <p className="text-[11px] text-muted-foreground">
              Week of {rangeLabel(week.start, new Date(new Date(week.end).getTime() - 86400000).toISOString())}.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

function QuickAction({
  href, icon, label, primary,
}: { href: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
        primary
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'border border-border bg-card text-foreground hover:bg-muted/50'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {icon}
        {label}
        {!primary && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
      </span>
    </Link>
  )
}
