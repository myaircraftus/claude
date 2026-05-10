/**
 * Phase 17 Sprint 17.2 — shared email layout helpers.
 *
 * One render function used by every transactional template. Keeps the
 * markup/styles in a single place so brand updates don't require
 * touching five files. Optimized for inbox compatibility (Gmail, Outlook,
 * Apple Mail) — no external CSS, table-based layout, all colors inline.
 *
 * The layout is intentionally minimal: hero brand strip → content
 * cards → footer with mailto-unsubscribe + a magic-link reminder for
 * the public ticket viewer (when applicable).
 */

export interface RenderLayoutOptions {
  preheader?: string
  /** Big call-to-action button (label + url). Optional. */
  cta?: { label: string; url: string } | null
  /** Plain-text fallback rendered identically to the HTML body. */
  text: string
  /** Inner HTML — paragraphs, lists, blockquotes. */
  bodyHtml: string
  /** Footer one-liner that overrides the default. */
  footerNote?: string
}

const BRAND_COLOR = '#0f172a'           // slate-900
const ACCENT_COLOR = '#2563eb'          // blue-600
const MUTED_COLOR = '#64748b'           // slate-500
const SURFACE_COLOR = '#f8fafc'         // slate-50

const SUPPORT_EMAIL = 'support@myaircraft.us'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://myaircraft.us'

export function renderLayout({ preheader, cta, bodyHtml, footerNote }: RenderLayoutOptions): string {
  const ctaHtml = cta
    ? `
      <tr>
        <td align="center" style="padding: 8px 0 24px;">
          <a href="${escapeHtml(cta.url)}"
             style="display:inline-block;padding:12px 24px;background:${ACCENT_COLOR};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
             ${escapeHtml(cta.label)}
          </a>
        </td>
      </tr>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light only" />
    <title>aircraft.us</title>
  </head>
  <body style="margin:0;padding:0;background:${SURFACE_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${BRAND_COLOR};">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE_COLOR};">
      <tr>
        <td align="center" style="padding: 24px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND_COLOR};color:#ffffff;padding:18px 24px;font-weight:700;font-size:15px;letter-spacing:0.02em;">
                aircraft.us
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 8px;font-size:15px;line-height:1.55;color:${BRAND_COLOR};">
                ${bodyHtml}
              </td>
            </tr>
            ${ctaHtml}
            <tr>
              <td style="padding: 16px 32px 28px;font-size:12px;line-height:1.5;color:${MUTED_COLOR};border-top:1px solid #e2e8f0;">
                ${footerNote ? `<p style="margin:0 0 12px;">${escapeHtml(footerNote)}</p>` : ''}
                <p style="margin:0;">
                  Questions? Reply to this email or contact
                  <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT_COLOR};">${SUPPORT_EMAIL}</a>.
                </p>
                <p style="margin:8px 0 0;">
                  <a href="${APP_URL}" style="color:${MUTED_COLOR};text-decoration:underline;">aircraft.us</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Build the plain-text counterpart of a layout. Match the same
 * sectioning so an inline-images-blocked / text-only client still gets
 * the full message.
 */
export function renderText({
  body,
  cta,
  footerNote,
}: { body: string; cta?: { label: string; url: string } | null; footerNote?: string }): string {
  const parts = ['aircraft.us', '', body.trim()]
  if (cta) parts.push('', `${cta.label}: ${cta.url}`)
  if (footerNote) parts.push('', footerNote)
  parts.push('', `Reply to this email or contact ${SUPPORT_EMAIL}.`, APP_URL)
  return parts.join('\n')
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const __layout_consts = { BRAND_COLOR, ACCENT_COLOR, MUTED_COLOR, SUPPORT_EMAIL, APP_URL }
