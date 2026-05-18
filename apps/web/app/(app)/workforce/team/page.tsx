/**
 * SOP-WRK-001 §10 — Team directory.
 *
 * Lists the shop's people: every accepted org member, joined with their
 * workforce_employee_profiles row (role, department, employment). Mechanics
 * are redirected to their own profile — they do not see the directory.
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { Topbar } from '@/components/shared/topbar'
import { getWorkforceContext } from '@/lib/workforce/context'

export const metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

type WorkforceRole = 'admin' | 'manager' | 'mechanic' | 'payroll_admin' | 'auditor'

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

const ROLE_BADGE: Record<WorkforceRole, string> = {
  admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  manager: 'bg-blue-50 text-blue-700 border-blue-200',
  mechanic: 'bg-slate-100 text-slate-700 border-slate-200',
  payroll_admin: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  auditor: 'bg-amber-50 text-amber-700 border-amber-200',
}
const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  inactive: 'bg-slate-100 text-slate-600 border-slate-200',
  on_leave: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default async function WorkforceTeamPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const ctx = await getWorkforceContext()
  const { supabase, organizationId, user } = ctx

  // SOP §10.2 — mechanics see only their own profile, not the directory.
  if (ctx.workforceRole === 'mechanic') {
    redirect(`/workforce/team/${user.id}`)
  }

  const { data: memberRows } = await supabase
    .from('organization_memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .not('accepted_at', 'is', null)
  const members = (memberRows ?? []) as Array<{ user_id: string; role: string }>
  const userIds = members.map((m) => m.user_id)

  const [{ data: profiles }, { data: wfProfiles }] = await Promise.all([
    userIds.length
      ? supabase.from('user_profiles').select('id, full_name, email, job_title').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length
      ? supabase
          .from('workforce_employee_profiles')
          .select('user_id, role_title, department, employment_status, workforce_role')
          .eq('organization_id', organizationId)
          .in('user_id', userIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const profileById = new Map<string, { full_name: string | null; email: string | null; job_title: string | null }>()
  for (const p of (profiles ?? []) as any[]) profileById.set(p.id, p)
  const wfById = new Map<string, any>()
  for (const w of (wfProfiles ?? []) as any[]) wfById.set(w.user_id, w)

  const q = (searchParams.q ?? '').trim().toLowerCase()
  const rows = members
    .map((m) => {
      const p = profileById.get(m.user_id)
      const w = wfById.get(m.user_id)
      const name = p?.full_name || p?.email || 'Employee'
      const wfRole: WorkforceRole = (w?.workforce_role as WorkforceRole) ??
        (['owner', 'admin'].includes(m.role) ? 'admin' : 'mechanic')
      return {
        userId: m.user_id,
        name,
        roleTitle: w?.role_title || p?.job_title || '—',
        department: w?.department || '—',
        employmentStatus: (w?.employment_status as string) || 'active',
        workforceRole: wfRole,
        hasProfile: Boolean(w),
      }
    })
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.roleTitle.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={ctx.profile} breadcrumbs={[{ label: 'Workforce' }, { label: 'Team' }]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Team</h1>
            <p className="text-muted-foreground text-sm">
              {rows.length} {rows.length === 1 ? 'person' : 'people'} in this shop.
            </p>
          </div>

          {/* Search */}
          <form method="GET" className="flex gap-2">
            <input
              name="q"
              type="search"
              defaultValue={searchParams.q ?? ''}
              placeholder="Search name or role…"
              className="h-9 w-72 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Search
            </button>
          </form>

          {/* Directory table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Employee</th>
                  <th className="px-4 py-3 text-left font-medium">Role / Title</th>
                  <th className="px-4 py-3 text-left font-medium">Department</th>
                  <th className="px-4 py-3 text-left font-medium">Workforce Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[12.5px] text-muted-foreground">
                      No team members found.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.userId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/workforce/team/${r.userId}`} className="flex items-center gap-2.5 group">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[12px] font-semibold text-blue-700">
                            {initials(r.name)}
                          </span>
                          <span className="font-medium text-foreground group-hover:text-primary">{r.name}</span>
                          {!r.hasProfile && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 border border-amber-200">
                              No profile
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.roleTitle}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.department}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[r.workforceRole]}`}>
                          {r.workforceRole.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[r.employmentStatus] ?? STATUS_BADGE.active}`}>
                          {r.employmentStatus.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
