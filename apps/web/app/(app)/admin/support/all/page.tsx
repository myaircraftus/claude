/**
 * /admin/support/all — Phase 16 Sprint 16.4
 *
 * Full ticket list with filters. Server-renders the first page using
 * URL-driven filters (status, severity, category, q) so it's
 * shareable and snapshot-able.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import {
  listTicketsForAdmin,
  type TicketStatus,
  type TicketSeverity,
  type TicketCategory,
} from '@/lib/support/tickets'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — All tickets' }

interface SearchParams {
  status?: string
  severity?: string
  category?: string
  q?: string
  page?: string
}

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

const STATUS_TINT: Record<string, string> = {
  new: 'bg-amber-50 text-amber-900 border-amber-200',
  ai_triaging: 'bg-blue-50 text-blue-900 border-blue-200',
  awaiting_admin: 'bg-rose-50 text-rose-900 border-rose-200',
  awaiting_customer: 'bg-slate-50 text-slate-700 border-slate-200',
  resolved: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  closed: 'bg-slate-50 text-slate-600 border-slate-200',
}

const PAGE_SIZE = 50

export default async function AdminSupportAllPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const page = Math.max(1, Number(searchParams.page ?? 1))
  const offset = (page - 1) * PAGE_SIZE

  const service = createServiceSupabase()
  const { tickets, total } = await listTicketsForAdmin(service, {
    status: searchParams.status ? (searchParams.status.split(',') as TicketStatus[]) : undefined,
    severity: searchParams.severity ? (searchParams.severity.split(',') as TicketSeverity[]) : undefined,
    category: searchParams.category ? (searchParams.category.split(',') as TicketCategory[]) : undefined,
    q: searchParams.q || undefined,
    limit: PAGE_SIZE,
    offset,
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Support', href: '/admin/support' },
        { label: 'All' },
      ]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>
                All tickets
              </h1>
              <p className="text-sm text-muted-foreground">{total} matching · page {page}</p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/support/inbox" className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-muted/40">Inbox</Link>
            </div>
          </div>

          <form className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-lg border border-border bg-white p-3">
            <select name="status" defaultValue={searchParams.status ?? ''} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="ai_triaging">AI triaging</option>
              <option value="awaiting_admin">Awaiting admin</option>
              <option value="awaiting_customer">Awaiting customer</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select name="severity" defaultValue={searchParams.severity ?? ''} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">All severities</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </select>
            <select name="category" defaultValue={searchParams.category ?? ''} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
              <option value="">All categories</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
              <option value="account">Account</option>
              <option value="bug">Bug</option>
              <option value="feature_request">Feature</option>
              <option value="other">Other</option>
            </select>
            <input
              type="text" name="q" defaultValue={searchParams.q ?? ''} placeholder="Search subject / body / number…"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm md:col-span-1"
            />
            <button type="submit" className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary/90">
              Filter
            </button>
          </form>

          <Card>
            <CardContent className="p-0">
              {tickets.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No tickets match these filters.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="text-left px-3 py-2">Ticket</th>
                      <th className="text-left px-3 py-2">Subject</th>
                      <th className="text-left px-3 py-2">Severity</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Category</th>
                      <th className="text-left px-3 py-2">Submitter</th>
                      <th className="text-left px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-3 py-2 font-mono text-[12px]">
                          <Link href={`/admin/support/${t.ticket_number}`} className="text-primary hover:underline">
                            {t.ticket_number}
                          </Link>
                        </td>
                        <td className="px-3 py-2 max-w-md truncate">{t.subject}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[11px] ${SEVERITY_TINT[t.severity]}`}>{t.severity}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-[11px] capitalize ${STATUS_TINT[t.status]}`}>
                            {t.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground capitalize">{t.category.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t.submitter_email}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(t.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {total > PAGE_SIZE && (
            <div className="flex justify-between text-sm">
              <Link
                href={{ pathname: '/admin/support/all', query: { ...searchParams, page: Math.max(1, page - 1) } }}
                className={`rounded-lg border border-border px-4 py-2 ${page === 1 ? 'pointer-events-none opacity-50' : 'hover:bg-muted/40'}`}
              >
                Previous
              </Link>
              <Link
                href={{ pathname: '/admin/support/all', query: { ...searchParams, page: page + 1 } }}
                className={`rounded-lg border border-border px-4 py-2 ${offset + PAGE_SIZE >= total ? 'pointer-events-none opacity-50' : 'hover:bg-muted/40'}`}
              >
                Next
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
