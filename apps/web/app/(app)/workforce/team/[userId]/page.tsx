/**
 * SOP-WRK-001 §10.2 — employee profile.
 *
 * Profile, Schedule, Time Clock history, Time Off, and Credentials for one
 * employee. Mechanics may only open their own profile. The admin workforce
 * role gets an inline editor for workforce attributes.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { Topbar } from '@/components/shared/topbar'
import { getWorkforceContext } from '@/lib/workforce/context'
import { EmployeeProfileForm, type EmployeeProfileInitial } from '../employee-profile-form'

export const metadata = { title: 'Employee Profile' }
export const dynamic = 'force-dynamic'

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[14px] font-bold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  )
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-[13px] text-foreground mt-0.5">{value}</p>
    </div>
  )
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: { userId: string }
}) {
  const ctx = await getWorkforceContext()
  const { supabase, organizationId, user } = ctx
  const targetId = params.userId

  // SOP §10.2 — mechanics may only view their own profile.
  if (ctx.workforceRole === 'mechanic' && targetId !== user.id) {
    redirect(`/workforce/team/${user.id}`)
  }

  // Target must be a member of this shop.
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', targetId)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (!membership) redirect('/workforce/team')

  const nowIso = new Date().toISOString()
  const [profileR, wfR, shiftsR, clockR, timeOffR] = await Promise.all([
    supabase.from('user_profiles').select('full_name, email, job_title, phone').eq('id', targetId).maybeSingle(),
    supabase
      .from('workforce_employee_profiles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', targetId)
      .maybeSingle(),
    supabase
      .from('shifts')
      .select('id, name, job_type, start_time, end_time')
      .eq('organization_id', organizationId)
      .eq('technician_id', targetId)
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(8),
    supabase
      .from('clock_events')
      .select('id, status, clock_in_at, clock_out_at, total_hours')
      .eq('organization_id', organizationId)
      .eq('employee_id', targetId)
      .order('clock_in_at', { ascending: false })
      .limit(10),
    supabase
      .from('time_off_requests')
      .select('id, request_type, start_date, end_date, status')
      .eq('organization_id', organizationId)
      .eq('employee_id', targetId)
      .order('start_date', { ascending: false })
      .limit(10),
  ])

  const profile = (profileR.data ?? {}) as { full_name?: string; email?: string; job_title?: string; phone?: string }
  const wf = wfR.data as Record<string, any> | null
  const shifts = (shiftsR.data ?? []) as Array<{ id: string; name: string; job_type: string | null; start_time: string; end_time: string }>
  const clock = (clockR.data ?? []) as Array<{ id: string; status: string; clock_in_at: string; clock_out_at: string | null; total_hours: number | null }>
  const timeOff = (timeOffR.data ?? []) as Array<{ id: string; request_type: string; start_date: string; end_date: string; status: string }>

  const name = profile.full_name || profile.email || 'Employee'
  const workforceRole = (wf?.workforce_role as string) ??
    (['owner', 'admin'].includes(membership.role) ? 'admin' : 'mechanic')

  const formInitial: EmployeeProfileInitial = {
    employee_code: (wf?.employee_code as string) ?? '',
    role_title: (wf?.role_title as string) ?? profile.job_title ?? '',
    department: (wf?.department as string) ?? '',
    employment_status: (wf?.employment_status as string) ?? 'active',
    employment_type: (wf?.employment_type as string) ?? 'hourly',
    workforce_role: workforceRole,
    hourly_rate_dollars:
      wf?.hourly_rate_cents != null ? (Number(wf.hourly_rate_cents) / 100).toFixed(2) : '',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={ctx.profile}
        breadcrumbs={[{ label: 'Workforce' }, { label: 'Team' }, { label: name }]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[16px] font-semibold text-blue-700">
              {name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{name}</h1>
              <p className="text-[13px] text-muted-foreground">
                {formInitial.role_title || 'Team member'} · {workforceRole.replace('_', ' ')}
              </p>
            </div>
          </div>

          {/* Profile */}
          <Section title="Profile">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Email" value={profile.email || '—'} />
              <Field label="Phone" value={profile.phone || '—'} />
              <Field label="Employee code" value={formInitial.employee_code || '—'} />
              <Field label="Department" value={formInitial.department || '—'} />
              <Field label="Employment status" value={formInitial.employment_status.replace('_', ' ')} />
              <Field label="Employment type" value={formInitial.employment_type} />
              {ctx.canViewPayRates && (
                <Field
                  label="Hourly rate"
                  value={formInitial.hourly_rate_dollars ? `$${formInitial.hourly_rate_dollars}` : '—'}
                />
              )}
            </div>
          </Section>

          {/* Admin editor */}
          {ctx.canManageTeam && (
            <Section title="Edit Workforce Profile">
              <EmployeeProfileForm
                userId={targetId}
                initial={formInitial}
                canViewPayRates={ctx.canViewPayRates}
              />
            </Section>
          )}

          {/* Schedule */}
          <Section title="Upcoming Schedule">
            {shifts.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No upcoming shifts.</p>
            ) : (
              <ul className="divide-y divide-border -my-1">
                {shifts.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <span className="text-[12.5px] font-medium text-foreground">{s.job_type || s.name || 'Shift'}</span>
                    <span className="ml-auto text-[11.5px] text-muted-foreground">
                      {fmtTime(s.start_time)} → {fmtTime(s.end_time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Time Clock history */}
          <Section title="Time Clock History">
            {clock.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No clock activity.</p>
            ) : (
              <ul className="divide-y divide-border -my-1">
                {clock.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <span className="text-[12.5px] text-foreground">{fmtTime(c.clock_in_at)}</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      → {c.clock_out_at ? fmtTime(c.clock_out_at) : 'open'}
                    </span>
                    <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">
                      {c.total_hours != null ? `${Number(c.total_hours).toFixed(2)} h` : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Time Off */}
          <Section title="Time Off">
            {timeOff.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No time-off requests.</p>
            ) : (
              <ul className="divide-y divide-border -my-1">
                {timeOff.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <span className="text-[12.5px] text-foreground">{t.request_type}</span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {fmtDate(t.start_date)} – {fmtDate(t.end_date)}
                    </span>
                    <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      t.status === 'approved'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : t.status === 'denied'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Credentials */}
          <Section title="Credentials">
            <p className="text-[12.5px] text-muted-foreground">
              A&amp;P / IA certificates and training records are tracked in{' '}
              <Link href="/expirations/licenses" className="text-primary hover:underline">
                Expirations → Licenses &amp; Aircraft Records
              </Link>
              . Per-shift credential enforcement is a Phase 2 item.
            </p>
          </Section>
        </div>
      </main>
    </div>
  )
}
