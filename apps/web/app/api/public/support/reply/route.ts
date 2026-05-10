/**
 * /api/public/support/reply — UNAUTHENTICATED reply via magic link.
 *
 * Phase 16 Sprint 16.2. Customer reply path for tickets viewed via the
 * `?token=<access_token>` magic link from the public submit confirmation
 * (or follow-up emails). Validates the token against the ticket;
 * returns 401 on mismatch.
 *
 * NOTE: ticket_replies table arrives in migration 110 (Sprint 16.3).
 * Until 110 is applied this route returns 503. The route itself is wired
 * now so Sprint 16.3 doesn't have to revisit /api/public/* paths.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getTicketByNumber, addTicketReply } from '@/lib/support/tickets'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const ticketNumber = typeof body.ticket_number === 'string' ? body.ticket_number : ''
  const accessToken = typeof body.access_token === 'string' ? body.access_token : ''
  const replyBody = typeof body.body === 'string' ? body.body.trim() : ''

  if (!ticketNumber || !accessToken || !replyBody) {
    return NextResponse.json(
      { error: 'ticket_number, access_token, and body are required' },
      { status: 400 },
    )
  }

  const service = createServiceSupabase()
  const ticket = await getTicketByNumber(service, ticketNumber, { accessToken }).catch(() => null)
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  if (ticket.status === 'closed' || ticket.status === 'resolved') {
    return NextResponse.json({ error: 'Ticket is closed' }, { status: 409 })
  }

  const result = await addTicketReply(service, {
    ticket_id: ticket.id,
    body: replyBody,
    is_from_customer: true,
  })

  if (!result.ok) {
    // Most likely cause when 110 isn't applied: relation "ticket_replies" doesn't exist.
    return NextResponse.json(
      { error: result.error, hint: 'ticket_replies table may not be applied yet (migration 110)' },
      { status: 503 },
    )
  }

  // Bump status back to awaiting_admin so the inbox re-surfaces.
  await service
    .from('support_tickets')
    .update({ status: 'awaiting_admin' })
    .eq('id', ticket.id)
    .in('status', ['awaiting_customer', 'new'])

  return NextResponse.json({ ok: true, reply_id: result.reply_id })
}
