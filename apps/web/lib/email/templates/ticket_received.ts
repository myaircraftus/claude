/**
 * Phase 17 Sprint 17.2 — ticket_received template.
 *
 * Sent immediately after a customer creates a support ticket. Confirms
 * we received it, surfaces the ticket number for follow-up, and gives
 * an honest SLA based on severity.
 */
import { renderLayout, renderText, escapeHtml } from './_layout'

export interface TicketReceivedInput {
  ticket_number: string
  subject: string
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  /** Public viewer URL with magic-link token. Optional — only included
   * when the submitter is unauthenticated. */
  viewer_url?: string | null
  /** Pre-formatted SLA window string ("2 hours", "1 business day", …). */
  sla_window: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export function renderTicketReceived(input: TicketReceivedInput): RenderedEmail {
  const subject = `We got your message — ${input.ticket_number}`
  const preheader = `Ticket ${input.ticket_number} opened — first response within ${input.sla_window}.`
  const cta = input.viewer_url
    ? { label: 'View your ticket', url: input.viewer_url }
    : null

  const bodyHtml = `
    <p style="margin:0 0 12px;">Thanks for reaching out — we've created ticket
       <strong>${escapeHtml(input.ticket_number)}</strong> for you.</p>
    <p style="margin:0 0 12px;"><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
    <p style="margin:0 0 12px;">A real person on our team will respond within
       <strong>${escapeHtml(input.sla_window)}</strong> based on the
       <strong>${input.severity}</strong> severity. For urgent issues you can also
       reply directly to this email — your message will land back on the same ticket.</p>
  `

  const text = renderText({
    body: [
      `Thanks for reaching out — we've created ticket ${input.ticket_number} for you.`,
      ``,
      `Subject: ${input.subject}`,
      ``,
      `A real person on our team will respond within ${input.sla_window} based on the ${input.severity} severity. For urgent issues you can also reply directly to this email — your message will land back on the same ticket.`,
    ].join('\n'),
    cta,
  })

  return {
    subject,
    html: renderLayout({ preheader, cta, bodyHtml, text }),
    text,
  }
}
