/**
 * Phase 17 Sprint 17.7 — Resend end-to-end smoke.
 *
 * Sends one real email through lib/email/resend-client.ts to verify
 * the wrapper-level path (env reads, retry shape, return contract)
 * matches what the curl-level smoke proved earlier. This is a manual
 * dev script — invoked with:
 *
 *   pnpm tsx apps/web/scripts/smoke-resend.ts
 *
 * Reads RESEND_API_KEY + RESEND_TEST_INBOX from .env.local.
 * Exits non-zero on failure so a bash runner can pipe it.
 */
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

loadEnv({ path: resolve(__dirname, '../.env.local') })

import { sendEmail } from '../lib/email/resend-client'

async function main() {
  const to = process.env.RESEND_TEST_INBOX ?? 'andy@horf.us'
  const apiKey = process.env.RESEND_API_KEY
  console.log(`[smoke] RESEND_API_KEY present: ${apiKey ? 'yes' : 'NO'}`)
  console.log(`[smoke] sending to: ${to}`)

  const r = await sendEmail({
    to,
    from: process.env.RESEND_FROM_DEFAULT ?? 'onboarding@resend.dev',
    subject: 'Phase 17 Sprint 17.7 — wrapper smoke ✈️',
    text:
      'This message went through lib/email/resend-client.ts. ' +
      'If you got this, the wrapper + retry contract are wired correctly.\n\n' +
      `Sent at ${new Date().toISOString()}.`,
    html:
      `<p>This message went through <code>lib/email/resend-client.ts</code>.</p>` +
      `<p>If you got this, the wrapper + retry contract are wired correctly.</p>` +
      `<p style="color:#64748b;font-size:12px;">Sent at ${new Date().toISOString()}</p>`,
    tags: [{ name: 'kind', value: 'wrapper_smoke' }, { name: 'phase', value: '17_7' }],
  })

  console.log('[smoke] result:', JSON.stringify(r, null, 2))
  if (!r.ok) {
    console.error('[smoke] FAILED')
    process.exit(1)
  }
  console.log('[smoke] OK')
}

main().catch((e) => {
  console.error('[smoke] uncaught:', e)
  process.exit(1)
})
