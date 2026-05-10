/**
 * /admin/support/inbox — Phase 16 Sprint 16.4
 *
 * Admin's primary support surface: tickets that need human attention,
 * sorted by severity then age. Each row shows ticket_number, severity
 * badge, customer, subject, AI summary (if any), age, and a "Open"
 * button that lands on the per-ticket detail page.
 *
 * Server-renders the initial list using listTicketsForAdmin filtered to
 * status='awaiting_admin' so the page is fast even when the inbox grows.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import {
  listTicketsForAdmin,
  describeSlaWindow,
  TICKET_SLA_WINDOW_MS,
  type SupportTicket,
} from '@/lib/support/tickets'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Support inbox' }

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

function ageMinutes(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
}

function formatAge(min: number): string {
  if (min < 60) return `${min}m`
  if (min < 24 * 60) return `${Math.round(min / 60)}h`
  return `${Math.round(min / (24 * 60))}d`
}

function isBreachingSla(ticket: SupportTicket): boolean {
  const elapsedMs = Date.now() - new Date(ticket.created_at).getTime()
  return elapsedMs > TICKET_SLA_WINDOW_MS[ticket.severity]
}

export default async function AdminSupportInboxPage() {
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

  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const { tickets, total } = await listTicketsForAdmin(service, {
    status: 'awaiting_admin',
    limit: 100,
  })

  const breaching = tickets.filter(isBreachingSla)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Support', href: '/admin/support' },
        { label: 'Inbox' },
      ]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>
                Support inbox
              </h1>
              <p className="text-sm text-muted-foreground">
                {total} awaiting your reply · {breaching.length} breaching SLA
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/support/all" className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-muted/40">
                All tickets
              </Link>
              <Link href="/admin/support" className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-muted/40">
                Overview
              </Link>
            </div>
          </div>

          {tickets.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <p className="text-base text-muted-foreground">No tickets need your attention right now.</p>
                <p className="text-sm text-muted-foreground mt-1">AI triage is handling everything that came in.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Awaiting admin ({tickets.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/admin/support/${t.ticket_number}`}
                        className="flex items-start justify-between gap-3 py-3 hover:bg-muted/40"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-mono ${SEVERITY_TINT[t.severity]}`}>
                            {t.severity}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{t.ticket_number}</span>
                              {isBreachingSla(t) && (
                                <span className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-900">
                                  SLA BREACH
                                </span>
                              )}
                            </div>
                            <p className="truncate text-sm" style={{ fontWeight: 500 }}>{t.subject}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.submitter_email} · {t.category.replace(/_/g, ' ')}
                              {t.suggested_response ? ' · AI draft ready' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <p>{formatAge(ageMinutes(t.created_at))}</p>
                          <p className="opacity-70">SLA {describeSlaWindow(t.severity)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
