/**
 * Phase 17 Sprint 17.2 — nps_survey template.
 *
 * 0-10 single-question NPS prompt. Each score is a tracked URL that
 * lands on /survey/nps?score=N&token=… so we can record without
 * making the user log in. The token is a short-lived signed value
 * (consumed by /api/feedback/nps in Phase 16 Sprint 16.9).
 */
import { renderLayout, renderText, escapeHtml } from './_layout'
import type { RenderedEmail } from './ticket_received'

export interface NpsSurveyInput {
  /** Customer first name when known; falls back to "there". */
  first_name?: string | null
  /** Base URL for the survey landing page; `?score=N&token=…` is appended. */
  survey_base_url: string
  /** Token that scopes the survey to this user — included on every score URL. */
  token: string
}

const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function renderNpsSurvey(input: NpsSurveyInput): RenderedEmail {
  const subject = `How likely are you to recommend aircraft.us?`
  const preheader = `One question. Pick a number 0–10.`

  const greeting = input.first_name?.trim() ? input.first_name.trim() : 'there'

  // Build a 0-10 score row as a table so it survives Outlook.
  const scoreCells = SCORES.map((s) => {
    const url = `${input.survey_base_url}?score=${s}&token=${encodeURIComponent(input.token)}`
    const tint = s <= 6 ? '#fee2e2' : s <= 8 ? '#fef3c7' : '#dcfce7'
    const ink = s <= 6 ? '#991b1b' : s <= 8 ? '#92400e' : '#166534'
    return `
      <td align="center" style="padding:4px;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;width:36px;height:36px;line-height:36px;background:${tint};color:${ink};text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
           ${s}
        </a>
      </td>`
  }).join('')

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hey ${escapeHtml(greeting)} — we'd love your feedback.</p>
    <p style="margin:0 0 16px;">On a scale of 0–10, how likely are you to recommend aircraft.us to another owner or mechanic?</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto;">
      <tr>${scoreCells}</tr>
    </table>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b;text-align:center;">0 = not likely · 10 = extremely likely</p>
  `

  const text = renderText({
    body: [
      `Hey ${greeting} — we'd love your feedback.`,
      ``,
      `On a scale of 0–10, how likely are you to recommend aircraft.us to another owner or mechanic?`,
      ``,
      `Pick a score:`,
      ...SCORES.map((s) => `  ${s}: ${input.survey_base_url}?score=${s}&token=${input.token}`),
    ].join('\n'),
    footerNote: 'Your response stays private and only takes a click.',
  })

  return {
    subject,
    html: renderLayout({ preheader, bodyHtml, text, footerNote: 'Your response stays private and only takes a click.' }),
    text,
  }
}
