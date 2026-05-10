/**
 * /admin/support/[ticketNumber] — Phase 16 Sprint 16.4 admin ticket detail.
 *
 * Full thread + customer/org context sidebar + reply form. The reply
 * form pre-fills with the AI's staged suggested_response so admin
 * can edit-and-send in one step. "Generate Claude Code Prompt" button
 * is wired in Sprint 16.11.
 */
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getTicketByNumber, listReplies, describeSlaWindow } from '@/lib/support/tickets'
import type { UserProfile } from '@/types'
import { AdminReplyForm } from './admin-reply-form'
import { GeneratePromptButton } from '@/components/admin/GeneratePromptButton'

export const metadata = { title: 'Admin — Ticket' }

const SEVERITY_TINT: Record<string, string> = {
  P0: 'bg-red-100 text-red-900 border-red-300',
  P1: 'bg-orange-100 text-orange-900 border-orange-300',
  P2: 'bg-amber-100 text-amber-900 border-amber-300',
  P3: 'bg-slate-100 text-slate-700 border-slate-300',
}

interface PageProps {
  params: { ticketNumber: string }
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const ticket = await getTicketByNumber(service, params.ticketNumber).catch(() => null)
  if (!ticket) notFound()

  let replies: Awaited<ReturnType<typeof listReplies>> = []
  try { replies = await listReplies(service, ticket.id) } catch { replies = [] }

  let orgContext: { name?: string; tier?: string; aircraft_count?: number; doc_count?: number } | null = null
  if (ticket.organization_id) {
    const [{ data: org }, { count: aircraftCount }, { count: docCount }] = await Promise.all([
      service.from('organizations').select('name, tier').eq('id', ticket.organization_id).maybeSingle(),
      service.from('aircraft').select('id', { count: 'exact', head: true }).eq('organization_id', ticket.organization_id).eq('is_archived', false),
      service.from('documents').select('id', { count: 'exact', head: true }).eq('organization_id', ticket.organization_id),
    ])
    orgContext = {
      name: (org as { name?: string } | null)?.name,
      tier: (org as { tier?: string } | null)?.tier,
      aircraft_count: aircraftCount ?? 0,
      doc_count: docCount ?? 0,
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'Support', href: '/admin/support' },
        { label: 'Inbox', href: '/admin/support/inbox' },
        { label: ticket.ticket_number },
      ]} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main thread + reply */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="font-mono text-xs text-muted-foreground">{ticket.ticket_number}</p>
                <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>{ticket.subject}</h1>
                <div className="flex items-center gap-2 text-sm">
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] ${SEVERITY_TINT[ticket.severity]}`}>{ticket.severity}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground capitalize">{ticket.status.replace(/_/g, ' ')}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{describeSlaWindow(ticket.severity)} SLA</span>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Thread</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Message author={ticket.submitter_email} ts={ticket.created_at} kind="customer">
                  {ticket.body}
                </Message>
                {replies.map((r) => (
                  <Message
                    key={r.id}
                    author={r.is_from_ai ? 'aircraft.us AI' : r.is_from_admin ? 'aircraft.us team' : ticket.submitter_email}
                    ts={r.created_at}
                    kind={r.is_from_ai ? 'ai' : r.is_from_admin ? 'admin' : 'customer'}
                  >
                    {r.body}
                  </Message>
                ))}
                {replies.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No replies yet — only the customer's original message above.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Reply</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminReplyForm
                  ticketId={ticket.id}
                  ticketNumber={ticket.ticket_number}
                  initialBody={ticket.suggested_response ?? ''}
                  hasAiDraft={!!ticket.suggested_response}
                  status={ticket.status}
                />
              </CardContent>
            </Card>
          </div>

          {/* Context sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Customer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="font-mono text-xs">{ticket.submitter_email}</p>
                <p className="text-muted-foreground">{ticket.source.replace(/_/g, ' ')}</p>
              </CardContent>
            </Card>

            {orgContext && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Organization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <p style={{ fontWeight: 600 }}>{orgContext.name ?? '(unknown)'}</p>
                  <p className="text-muted-foreground">Tier: {orgContext.tier ?? 'beta'}</p>
                  <p className="text-muted-foreground">{orgContext.aircraft_count ?? 0} aircraft · {orgContext.doc_count ?? 0} docs</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Triage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <p className="text-muted-foreground">Category: <span className="capitalize text-foreground">{ticket.category.replace(/_/g, ' ')}</span></p>
                <p className="text-muted-foreground">AI replies: <span className="text-foreground">{ticket.ai_response_count}</span></p>
                {ticket.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ticket.tags.map((t) => (
                      <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{t}</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tools</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <GeneratePromptButton
                  sourceType="support_ticket"
                  sourceId={ticket.id}
                  disabled={ticket.status === 'resolved' || ticket.status === 'closed'}
                />
                <Link
                  href={`/admin/support/all?q=${encodeURIComponent(ticket.submitter_email)}`}
                  className="block rounded-md border border-border bg-white px-3 py-2 text-center text-sm hover:bg-muted/40"
                >
                  Other tickets from this customer
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

function Message({
  author, ts, kind, children,
}: { author: string; ts: string; kind: 'customer' | 'ai' | 'admin'; children: React.ReactNode }) {
  const tint =
    kind === 'ai'
      ? 'bg-blue-50 border-blue-200'
      : kind === 'admin'
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-slate-50 border-border'
  return (
    <div className={`rounded-xl border ${tint} p-4`}>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
        <span className="font-medium text-foreground">{author}</span>
        <span>{new Date(ts).toLocaleString()}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap text-foreground">{children}</p>
    </div>
  )
}
