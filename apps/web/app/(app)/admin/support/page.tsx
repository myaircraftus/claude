/**
 * /admin/support — Phase 16 Sprint 16.2 admin overview.
 *
 * Full rewrite of the schema-collision shim. Pulls the latest 200
 * tickets across all orgs, groups by status, surfaces severity. The
 * deeper inbox + per-ticket detail surface lands in Sprint 16.4
 * (/admin/support/inbox + /admin/support/all + /admin/support/[ticket_number]).
 *
 * Visible only to platform admins (gated by parent /admin layout +
 * a defensive check here for the legacy ForbiddenCard fallback).
 */
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ChevronRight, AlertTriangle, LifeBuoy } from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listTicketsForAdmin } from '@/lib/support/tickets'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Support' }

function ForbiddenCard() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <CardTitle className="text-lg">Access Denied</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have platform administrator privileges.
          </p>
          <div className="mt-4">
            <Link href="/dashboard" className="text-sm text-primary hover:underline flex items-center gap-1">
              Return to dashboard
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const STATUS_TINT: Record<string, string> = {
  new: 'bg-amber-50 text-amber-900 border-amber-200',
  ai_triaging: 'bg-blue-50 text-blue-900 border-blue-200',
  awaiting_admin: 'bg-rose-50 text-rose-900 border-rose-200',
  awaiting_customer: 'bg-slate-50 text-slate-700 border-slate-200',
  resolved: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  closed: 'bg-slate-50 text-slate-600 border-slate-200',
}

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

export default async function AdminSupportPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile

  if (!profile.is_platform_admin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Support' }]} />
        <main className="flex-1 overflow-y-auto">
          <ForbiddenCard />
        </main>
      </div>
    )
  }

  const service = createServiceSupabase()
  const [open, recent] = await Promise.all([
    listTicketsForAdmin(service, {
      status: ['new', 'ai_triaging', 'awaiting_admin'],
      limit: 50,
    }),
    listTicketsForAdmin(service, { limit: 20 }),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Support' }]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <LifeBuoy className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
              <p className="text-sm text-muted-foreground">
                {open.total} open · Sprint 16.4 brings the full inbox + ticket detail.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Open ({open.total})</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketList tickets={open.tickets} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent (any status)</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketList tickets={recent.tickets} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

function TicketList({ tickets }: { tickets: Awaited<ReturnType<typeof listTicketsForAdmin>>['tickets'] }) {
  if (tickets.length === 0) {
    return <p className="text-sm text-muted-foreground">No tickets.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="text-left px-3 py-2">Ticket</th>
            <th className="text-left px-3 py-2">Subject</th>
            <th className="text-left px-3 py-2">Severity</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Submitter</th>
            <th className="text-left px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-mono text-[12px]">{t.ticket_number}</td>
              <td className="px-3 py-2 max-w-md truncate">{t.subject}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] ${SEVERITY_TINT[t.severity] ?? ''}`}>
                  {t.severity}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] capitalize ${STATUS_TINT[t.status] ?? ''}`}>
                  {t.status.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{t.submitter_email}</td>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {new Date(t.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
