/**
 * /admin/observability/errors — Phase 16 Sprint 16.5
 *
 * Server-rendered list of error_events grouped by stack_hash, with
 * filters for origin / route / persona / time range. Detail per row
 * shows full stack + occurrence count + status.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Errors' }

interface SearchParams {
  origin?: string
  route?: string
  persona?: string
  status?: string
  since_hours?: string
  page?: string
}

const STATUS_TINT: Record<string, string> = {
  new: 'bg-amber-100 text-amber-900 border-amber-300',
  investigating: 'bg-blue-100 text-blue-900 border-blue-300',
  known_issue: 'bg-slate-100 text-slate-700 border-slate-300',
  resolved: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  wont_fix: 'bg-rose-100 text-rose-900 border-rose-300',
}

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

const PAGE_SIZE = 50

interface ErrorEventRow {
  id: string
  origin: string
  stack_hash: string
  message: string
  route: string | null
  persona: string | null
  build_sha: string | null
  severity: string
  status: string
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  organization_id: string | null
}

export default async function AdminErrorsPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const sinceHours = Math.max(1, Math.min(720, Number(searchParams.since_hours ?? 24)))
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60_000).toISOString()
  const page = Math.max(1, Number(searchParams.page ?? 1))
  const offset = (page - 1) * PAGE_SIZE

  const service = createServiceSupabase()
  let query = service
    .from('error_events')
    .select('*', { count: 'exact' })
    .gte('last_seen_at', sinceIso)

  if (searchParams.origin) query = query.eq('origin', searchParams.origin)
  if (searchParams.route) query = query.eq('route', searchParams.route)
  if (searchParams.persona) query = query.eq('persona', searchParams.persona)
  if (searchParams.status) query = query.eq('status', searchParams.status)

  const { data, count, error } = await query
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  const events = ((data ?? []) as unknown as ErrorEventRow[])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Observability' },
        { label: 'Errors' },
      ]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>
                Errors
              </h1>
              <p className="text-sm text-muted-foreground">
                {count ?? 0} groups in the last {sinceHours}h{error ? ' · query error: ' + error.message : ''}
              </p>
            </div>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-border bg-white p-3">
            <select name="origin" defaultValue={searchParams.origin ?? ''} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">All origins</option>
              <option value="client">client</option>
              <option value="server_route">server_route</option>
              <option value="server_worker">server_worker</option>
              <option value="ingestion">ingestion</option>
            </select>
            <select name="status" defaultValue={searchParams.status ?? ''} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="known_issue">Known issue</option>
              <option value="resolved">Resolved</option>
              <option value="wont_fix">Won&rsquo;t fix</option>
            </select>
            <input
              type="text" name="route" defaultValue={searchParams.route ?? ''} placeholder="Route prefix"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <input
              type="text" name="persona" defaultValue={searchParams.persona ?? ''} placeholder="Persona"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
            <select name="since_hours" defaultValue={String(sinceHours)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="1">Last 1h</option>
              <option value="24">Last 24h</option>
              <option value="168">Last 7d</option>
              <option value="720">Last 30d</option>
            </select>
            <button type="submit" className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90">
              Filter
            </button>
          </form>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Groups</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No errors in this window.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left px-3 py-2">Sev</th>
                      <th className="text-left px-3 py-2">Origin</th>
                      <th className="text-left px-3 py-2">Message</th>
                      <th className="text-left px-3 py-2">Route</th>
                      <th className="text-left px-3 py-2">Count</th>
                      <th className="text-left px-3 py-2">Last seen</th>
                      <th className="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[11px] ${SEVERITY_TINT[e.severity]}`}>{e.severity}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{e.origin}</td>
                        <td className="px-3 py-2 max-w-md truncate font-mono text-[12px]" title={e.message}>{e.message}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[12px]">{e.route ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-[12px]">{e.occurrence_count}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(e.last_seen_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[11px] capitalize ${STATUS_TINT[e.status] ?? ''}`}>
                            {e.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {count != null && count > PAGE_SIZE && (
            <div className="flex justify-between text-sm">
              <Link
                href={{ pathname: '/admin/observability/errors', query: { ...searchParams, page: Math.max(1, page - 1) } }}
                className={`rounded-lg border border-border px-4 py-2 ${page === 1 ? 'pointer-events-none opacity-50' : 'hover:bg-muted/40'}`}
              >Previous</Link>
              <Link
                href={{ pathname: '/admin/observability/errors', query: { ...searchParams, page: page + 1 } }}
                className={`rounded-lg border border-border px-4 py-2 ${offset + PAGE_SIZE >= count ? 'pointer-events-none opacity-50' : 'hover:bg-muted/40'}`}
              >Next</Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
