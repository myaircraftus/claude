/**
 * Phase 17 Sprint 17.2 — magic_link_support_view template.
 *
 * Sent when an admin invites an unauthenticated submitter (or a
 * customer outside the org) to view their ticket via a signed link.
 * The link expires in 7 days and is single-recipient — calling out
 * the expiry in the body avoids confused replies a week later.
 */
import { renderLayout, renderText, escapeHtml } from './_layout'
import type { RenderedEmail } from './ticket_received'

export interface MagicLinkSupportViewInput {
  ticket_number: string
  ticket_subject: string
  /** Fully qualified link with token. */
  magic_link_url: string
  /** Expiration in human form, e.g. "7 days" or "Friday, May 17". */
  expires_in: string
}

export function renderMagicLinkSupportView(input: MagicLinkSupportViewInput): RenderedEmail {
  const subject = `View your support ticket — ${input.ticket_number}`
  const preheader = `One-click access to ${input.ticket_number}. Link expires in ${input.expires_in}.`

  const bodyHtml = `
    <p style="margin:0 0 12px;">You can view ticket
       <strong>${escapeHtml(input.ticket_number)}</strong> — "${escapeHtml(input.ticket_subject)}" — using the secure link below.</p>
    <p style="margin:0 0 12px;color:#64748b;font-size:13px;">This link is unique to you and expires in ${escapeHtml(input.expires_in)}. Don't share it.</p>
  `

  const cta = { label: 'Open ticket', url: input.magic_link_url }
  const text = renderText({
    body: [
      `You can view ticket ${input.ticket_number} — "${input.ticket_subject}" — using the secure link below.`,
      ``,
      `This link is unique to you and expires in ${input.expires_in}. Don't share it.`,
    ].join('\n'),
    cta,
  })

  return {
    subject,
    html: renderLayout({ preheader, cta, bodyHtml, text }),
    text,
  }
}
