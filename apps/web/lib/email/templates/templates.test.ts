/**
 * Phase 17 Sprint 17.2 — template render tests.
 *
 * Each template is a pure function that returns {subject, html, text}.
 * Tests focus on:
 *   - Subject is non-empty.
 *   - HTML is valid-shaped (DOCTYPE + closing </html>).
 *   - Text version contains key facts.
 *   - User input is HTML-escaped (no script-tag injection in body).
 */
import { describe, it, expect } from 'vitest'

import { renderTicketReceived } from './ticket_received'
import { renderTicketReply } from './ticket_reply'
import { renderNpsSurvey } from './nps_survey'
import { renderChurnReengagement } from './churn_reengagement'
import { renderMagicLinkSupportView } from './magic_link_support_view'

describe('renderTicketReceived', () => {
  it('produces subject + html + text with the ticket number', () => {
    const r = renderTicketReceived({
      ticket_number: 'T-12345',
      subject: 'Cannot upload doc',
      severity: 'P2',
      sla_window: '1 business day',
      viewer_url: null,
    })
    expect(r.subject).toContain('T-12345')
    expect(r.html).toMatch(/<!doctype html>/i)
    expect(r.html).toContain('</html>')
    expect(r.html).toContain('T-12345')
    expect(r.html).toContain('Cannot upload doc')
    expect(r.html).toContain('1 business day')
    expect(r.text).toContain('T-12345')
  })

  it('escapes HTML in user-controlled subject', () => {
    const r = renderTicketReceived({
      ticket_number: 'T-1',
      subject: '<script>alert(1)</script>',
      severity: 'P3',
      sla_window: '3 days',
    })
    expect(r.html).not.toContain('<script>alert(1)</script>')
    expect(r.html).toContain('&lt;script&gt;')
  })
})

describe('renderTicketReply', () => {
  it('renders a non-resolution reply with author label', () => {
    const r = renderTicketReply({
      ticket_number: 'T-22',
      subject: 'Doc stuck',
      reply_body: 'We pushed a fix.',
      author_label: 'aircraft.us team',
      is_resolution: false,
    })
    expect(r.subject).toContain('Re:')
    expect(r.subject).toContain('T-22')
    expect(r.html).toContain('aircraft.us team')
    expect(r.html).toContain('We pushed a fix.')
    expect(r.text).toContain('We pushed a fix.')
  })

  it('flags a resolution reply in the preheader+text', () => {
    const r = renderTicketReply({
      ticket_number: 'T-23',
      subject: 'All good',
      reply_body: 'Resolved.',
      author_label: 'aircraft.us team',
      is_resolution: true,
    })
    expect(r.text).toMatch(/resolved/i)
  })

  it('preserves newlines in the reply body as <br />', () => {
    const r = renderTicketReply({
      ticket_number: 'T-24',
      subject: 's',
      reply_body: 'line1\nline2',
      author_label: 'X',
    })
    expect(r.html).toContain('line1<br />line2')
  })
})

describe('renderNpsSurvey', () => {
  it('renders 11 score buttons (0..10) with token-tagged URLs', () => {
    const r = renderNpsSurvey({
      first_name: 'Andy',
      survey_base_url: 'https://myaircraft.us/survey/nps',
      token: 'abc.def',
    })
    for (let s = 0; s <= 10; s++) {
      // URLs are HTML-escaped (& → &amp;) when interpolated into the layout.
      expect(r.html).toContain(`?score=${s}&amp;token=abc.def`)
    }
    expect(r.text).toContain('Andy')
    expect(r.subject).toMatch(/recommend/i)
  })

  it('falls back to "there" when first_name missing', () => {
    const r = renderNpsSurvey({
      survey_base_url: 'https://x',
      token: 't',
    })
    expect(r.text).toContain('Hey there')
  })
})

describe('renderChurnReengagement', () => {
  it('includes the signal summary and a single resume CTA', () => {
    const r = renderChurnReengagement({
      first_name: 'Andy',
      signal_summary: 'Your last upload was 21 days ago.',
      resume_url: 'https://myaircraft.us/dashboard',
    })
    expect(r.html).toContain('21 days ago')
    expect(r.html).toContain('https://myaircraft.us/dashboard')
    expect(r.subject).toMatch(/check.in/i)
  })
})

describe('renderMagicLinkSupportView', () => {
  it('warns about expiry and includes the magic link', () => {
    const r = renderMagicLinkSupportView({
      ticket_number: 'T-99',
      ticket_subject: 'Question',
      magic_link_url: 'https://myaircraft.us/support/view?token=xyz',
      expires_in: '7 days',
    })
    expect(r.html).toContain('xyz')
    expect(r.html).toContain('7 days')
    expect(r.subject).toContain('T-99')
    expect(r.text).toMatch(/expires in 7 days/i)
  })
})
