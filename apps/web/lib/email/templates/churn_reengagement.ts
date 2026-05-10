/**
 * Phase 17 Sprint 17.2 — churn_reengagement template.
 *
 * Sent when the churn signal detector (Sprint 16.9) flags an account
 * as at-risk: low recent logins, dropped doc upload velocity, or
 * tier-downgrade signal. Tone: warm, low-pressure, with a single CTA
 * to a saved-state landing page so the user can resume what they were
 * doing instead of starting from scratch.
 */
import { renderLayout, renderText, escapeHtml } from './_layout'
import type { RenderedEmail } from './ticket_received'

export interface ChurnReengagementInput {
  first_name?: string | null
  /** "Your last upload was 3 weeks ago" / "Most owners log books weekly". */
  signal_summary: string
  /** Single tracked CTA URL — usually /dashboard. */
  resume_url: string
  /** Optional admin's name for personalization. */
  admin_name?: string | null
}

export function renderChurnReengagement(input: ChurnReengagementInput): RenderedEmail {
  const subject = `Quick check-in from aircraft.us`
  const preheader = `${input.signal_summary} — anything we can help with?`
  const greeting = input.first_name?.trim() ? input.first_name.trim() : 'there'
  const adminName = input.admin_name?.trim() ?? 'the aircraft.us team'

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(greeting)},</p>
    <p style="margin:0 0 12px;">${escapeHtml(input.signal_summary)}</p>
    <p style="margin:0 0 12px;">If something's blocking you — a stalled upload, a missing feature, a question about pricing — just reply to this email. A real person reads every reply.</p>
    <p style="margin:0 0 12px;">Or pick up where you left off below.</p>
    <p style="margin:0 0 0;color:#64748b;">— ${escapeHtml(adminName)}</p>
  `

  const cta = { label: 'Resume in aircraft.us', url: input.resume_url }
  const text = renderText({
    body: [
      `Hi ${greeting},`,
      ``,
      input.signal_summary,
      ``,
      `If something's blocking you — a stalled upload, a missing feature, a question about pricing — just reply to this email. A real person reads every reply.`,
      ``,
      `Or pick up where you left off:`,
      ``,
      `— ${adminName}`,
    ].join('\n'),
    cta,
  })

  return {
    subject,
    html: renderLayout({ preheader, cta, bodyHtml, text }),
    text,
  }
}
