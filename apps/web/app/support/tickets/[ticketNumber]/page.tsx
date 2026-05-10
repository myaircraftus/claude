/**
 * /support/tickets/[ticketNumber] — Phase 16 Sprint 16.2 customer-side
 * ticket detail.
 *
 * Two access paths:
 *   - Authenticated user whose email matches submitter_email → RLS allows read.
 *   - Unauth user with `?token=<access_token>` query — magic link from
 *     the public submit confirmation.
 *
 * Server component renders thread + status + ETA. The reply form
 * (client component) submits new customer messages.
 *
 * Note: ticket_replies table arrives in migration 110 (Sprint 16.3).
 * Until that's applied this page renders the ticket header + status
 * but the replies thread is empty. The reply form is gated behind
 * "ticket_replies table available" so it doesn't 500 in the gap.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getTicketByNumber, listReplies, describeSlaWindow } from '@/lib/support/tickets'
import { ReplyForm } from './reply-form'

export const metadata: Metadata = {
  title: 'Support ticket · aircraft.us',
  robots: { index: false, follow: false },
}

interface PageProps {
  params: { ticketNumber: string }
  searchParams: { token?: string }
}

export default async function TicketDetailPage({ params, searchParams }: PageProps) {
  const ticketNumber = params.ticketNumber
  const token = searchParams.token

  // Try the auth path first (user signed in + RLS).
  const authClient = createServerSupabase()
  let ticket = await getTicketByNumber(authClient, ticketNumber).catch(() => null)

  // Fall back to magic-link path: service-role + access_token check.
  if (!ticket && token) {
    const service = createServiceSupabase()
    ticket = await getTicketByNumber(service, ticketNumber, { accessToken: token }).catch(() => null)
  }

  if (!ticket) notFound()

  // Replies (table lands in migration 110; tolerate the table-missing case).
  let replies: Awaited<ReturnType<typeof listReplies>> = []
  try {
    replies = await listReplies(authClient, ticket.id)
  } catch {
    replies = []
  }

  const slaCopy = describeSlaWindow(ticket.severity)
  const created = new Date(ticket.created_at).toLocaleString()

  return (
    <PublicLayout>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-1 mb-8">
          <p className="font-mono text-sm text-muted-foreground">{ticket.ticket_number}</p>
          <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>
            {ticket.subject}
          </h1>
          <p className="text-sm text-muted-foreground">
            Opened {created} · status <span className="font-medium">{ticket.status}</span> · {slaCopy} expected response
          </p>
        </div>

        <div className="space-y-4 border border-border rounded-2xl bg-white p-6">
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
        </div>

        <div className="mt-8">
          <h2 className="text-base mb-3" style={{ fontWeight: 600 }}>
            Reply
          </h2>
          <ReplyForm
            ticketNumber={ticket.ticket_number}
            accessToken={token ?? undefined}
            disabled={ticket.status === 'closed' || ticket.status === 'resolved'}
          />
        </div>
      </main>
    </PublicLayout>
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
