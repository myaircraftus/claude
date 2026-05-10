/**
 * Phase 17 Sprint 17.1 — Resend HTTP client.
 *
 * Thin wrapper around Resend's REST API. We avoid the official npm SDK
 * to keep the dependency surface small and to make HTTP errors easy to
 * inspect in tests. Reads RESEND_API_KEY at *call* time (not module
 * top-level) so test environments can mutate process.env safely.
 *
 * Design rules:
 * - All transactional sends go through this module.
 * - Direct callers should be limited to lib/email/queue-worker.ts and
 *   lib/email/send-helpers.ts. Application code stays at the helper
 *   level so we never bypass the email_log queue.
 * - 5xx → retry up to 3 times with exponential backoff (250ms → 500ms
 *   → 1s). 4xx → fail immediately (no retry — those are permanent).
 * - Rate-limit: Resend allows 100 requests / second; the queue worker
 *   stays well below that with a 50-row batch every minute.
 */

const RESEND_BASE = 'https://api.resend.com'
const DEFAULT_FROM = process.env.RESEND_FROM_DEFAULT ?? 'support@myaircraft.us'
const DEFAULT_REPLY_TO = process.env.RESEND_REPLY_TO_DEFAULT ?? 'support@myaircraft.us'

export interface SendEmailParams {
  to: string | string[]
  from?: string
  subject: string
  html?: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
  /** Tags surface in the Resend dashboard; useful for filtering. */
  tags?: Array<{ name: string; value: string }>
}

export interface SendEmailResult {
  ok: boolean
  /** Resend message id when sent. */
  id?: string
  /** Permanent or final error message. */
  error?: string
  /** HTTP status of the last response. */
  status?: number
  /** Whether the failure looked retriable (500-class). */
  retriable?: boolean
}

interface ResendApiOk { id: string }
interface ResendApiErr { name?: string; message?: string; statusCode?: number }

function readApiKey(): string | null {
  const k = process.env.RESEND_API_KEY?.trim()
  return k && k.length > 0 ? k : null
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms))
}

/**
 * Send a single email via Resend. Returns a normalized result; never
 * throws for HTTP errors (callers — particularly the queue worker —
 * decide whether to mark a row failed or retry on next tick).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = readApiKey()
  if (!apiKey) {
    return {
      ok: false,
      error: 'RESEND_API_KEY missing — refusing to send.',
      status: 0,
      retriable: false,
    }
  }

  const body: Record<string, unknown> = {
    from: params.from ?? DEFAULT_FROM,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    text: params.text,
  }
  if (params.html) body.html = params.html
  if (params.replyTo ?? DEFAULT_REPLY_TO) body.reply_to = params.replyTo ?? DEFAULT_REPLY_TO
  if (params.headers) body.headers = params.headers
  if (params.tags) body.tags = params.tags

  const url = `${RESEND_BASE}/emails`
  const headers: HeadersInit = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // Up to 3 attempts on retriable failures (5xx + network).
  const backoffs = [0, 250, 500, 1000]
  let lastErr = ''
  let lastStatus = 0
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    if (backoffs[attempt] > 0) await sleep(backoffs[attempt])
    try {
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      lastStatus = resp.status
      const data = (await resp.json().catch(() => ({}))) as ResendApiOk & ResendApiErr
      if (resp.ok && (data as ResendApiOk).id) {
        return { ok: true, id: (data as ResendApiOk).id, status: resp.status }
      }
      const errText = (data as ResendApiErr).message ?? `HTTP ${resp.status}`
      // 5xx is retriable, 4xx is permanent.
      if (resp.status >= 500) {
        lastErr = errText
        continue
      }
      return { ok: false, error: errText, status: resp.status, retriable: false }
    } catch (e) {
      // Network error — treat as retriable.
      lastErr = e instanceof Error ? e.message : 'network error'
    }
  }
  return { ok: false, error: lastErr || 'Resend send failed after retries', status: lastStatus, retriable: true }
}

// Re-exports for tests.
export const __testing = { readApiKey }
