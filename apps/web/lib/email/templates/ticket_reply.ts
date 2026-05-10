/**
 * Phase 17 Sprint 17.2 — ticket_reply template.
 *
 * Sent when AI or admin posts a reply on an existing ticket. The reply
 * body becomes the message; the original subject is preserved with a
 * Re: prefix so most clients thread correctly.
 */
import { renderLayout, renderText, escapeHtml } from './_layout'
import type { RenderedEmail } from './ticket_received'

export interface TicketReplyInput {
  ticket_number: string
  /** The ticket subject *without* a Re: prefix. The template adds it. */
  subject: string
  reply_body: string
  /** Author label rendered as the from-name. "aircraft.us team" / "aircraft.us AI". */
  author_label: string
  /** True when the reply also marks the ticket resolved. */
  is_resolution?: boolean
  /** Public viewer link. Optional. */
  viewer_url?: string | null
}

export function renderTicketReply(input: TicketReplyInput): RenderedEmail {
  const subject = `Re: ${input.subject} [${input.ticket_number}]`
  const preheader = input.is_resolution
    ? `Your ticket ${input.ticket_number} has been resolved.`
    : `New reply on ticket ${input.ticket_number} from ${input.author_label}.`

  const cta = input.viewer_url
    ? { label: 'View ticket', url: input.viewer_url }
    : null

  // Preserve line breaks; keep the body as plain text wrapped in a div.
  const safeReply = escapeHtml(input.reply_body).replace(/\n/g, '<br />')

  const bodyHtml = `
    <p style="margin:0 0 12px;">${input.is_resolution ? 'Your ticket has been resolved.' : `New reply on ticket <strong>${escapeHtml(input.ticket_number)}</strong>:`}</p>
    <div style="margin:12px 0 16px;padding:14px 16px;background:#f1f5f9;border-radius:8px;border-left:3px solid #2563eb;">
      <p style="margin:0 0 8px;font-size:12px;color:#64748b;">${escapeHtml(input.author_label)}</p>
      <div style="font-size:14px;color:#0f172a;line-height:1.55;">${safeReply}</div>
    </div>
    <p style="margin:0 0 12px;">You can reply to this email to continue the conversation — your message will be added to the ticket automatically.</p>
  `

  const text = renderText({
    body: [
      input.is_resolution
        ? `Your ticket ${input.ticket_number} has been resolved.`
        : `New reply on ticket ${input.ticket_number} from ${input.author_label}:`,
      ``,
      input.reply_body,
      ``,
      `You can reply to this email to continue the conversation.`,
    ].join('\n'),
    cta,
  })

  return {
    subject,
    html: renderLayout({ preheader, cta, bodyHtml, text }),
    text,
  }
}
