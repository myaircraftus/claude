/**
 * /api/admin/support/[id]/reply — admin sends a reply to a ticket.
 *
 * Phase 16 Sprint 16.3 — used by the admin inbox (Sprint 16.4 surfaces
 * the UI). Two modes:
 *
 *   POST { body, send_email }
 *     Materializes the AI's staged suggested_response (or admin's edited
 *     version) as a ticket_replies row with is_from_admin=true. Clears
 *     suggested_response. If send_email=true, queues an email_log row.
 *
 *   POST { feedback: 'ai_was_wrong', ... }
 *     Admin-side training signal — flag the AI draft as wrong without
 *     sending. Recorded in suggested_response_feedback for tuning.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { addTicketReply, updateTicketStatus, type SupportTicket } from '@/lib/support/tickets'
import { sendTicketReply } from '@/lib/email/send-helpers'

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const service = createServiceSupabase()
  const { data: ticketRow } = await service
    .from('support_tickets')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()
  if (!ticketRow) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  const ticket = ticketRow as SupportTicket

  // Path B: AI-was-wrong feedback (no reply sent).
  if (body.feedback === 'ai_was_wrong') {
    await service
      .from('support_tickets')
      .update({
        suggested_response: null,
        triage_classification: ticket.triage_classification
          ? { ...(ticket.triage_classification as Record<string, unknown>), feedback: 'ai_was_wrong', feedback_note: typeof body.note === 'string' ? body.note.slice(0, 500) : null }
          : { feedback: 'ai_was_wrong' },
      })
      .eq('id', ticket.id)
    return NextResponse.json({ ok: true, feedback_recorded: true })
  }

  // Path A: send admin reply.
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''
  if (!replyBody) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  const replyResult = await addTicketReply(service, {
    ticket_id: ticket.id,
    body: replyBody,
    is_from_admin: true,
    admin_user_id: guard.user.id,
  })
  if (!replyResult.ok) {
    return NextResponse.json({ error: replyResult.error }, { status: 500 })
  }

  // Clear the staged AI draft (it's now realized as a reply row).
  await service
    .from('support_tickets')
    .update({ suggested_response: null })
    .eq('id', ticket.id)

  // Auto-flip status: typically admin reply → awaiting_customer.
  // If admin opted to resolve in-line, honour that.
  const nextStatus = body.resolve === true ? 'resolved' : 'awaiting_customer'
  await updateTicketStatus(service, ticket.id, nextStatus, {
    resolution_summary: body.resolve === true ? (typeof body.resolution_summary === 'string' ? body.resolution_summary : 'Resolved by admin') : undefined,
  })

  // Queue outbound email through the Phase 17 send helper. The cron
  // worker (lib/email/queue-worker.ts) hands the row off to Resend.
  if (body.send_email !== false) {
    try {
      await sendTicketReply(
        service,
        {
          to_email: ticket.submitter_email,
          to_user_id: ticket.submitter_user_id,
          organization_id: ticket.organization_id,
          related_ticket_id: ticket.id,
          related_reply_id: replyResult.reply_id,
        },
        {
          ticket_number: ticket.ticket_number,
          subject: ticket.subject,
          reply_body: replyBody,
          author_label: 'aircraft.us team',
          is_resolution: nextStatus === 'resolved',
          viewer_url: null,
        },
      )
    } catch { /* tolerate — admin can still see the reply in the inbox */ }
  }

  return NextResponse.json({ ok: true, reply_id: replyResult.reply_id, status: nextStatus })
}
