/**
 * Resend inbound-email webhook payload parser.
 *
 * Resend's inbound product POSTs a JSON envelope describing each
 * received message (https://resend.com/docs/inbound-emails/overview).
 * The exact shape changes — we keep this parser tolerant of unknown
 * fields and only read what we need.
 *
 * The payload becomes one row in public.inbox_messages.
 */

export interface ResendInboundPayload {
  /** Resend message id — used to dedupe webhook retries. */
  id?: string
  from?: string
  to?: string | string[]
  cc?: string | string[]
  subject?: string
  text?: string
  html?: string
  /** RFC5322 headers, lower-cased keys. */
  headers?: Record<string, string | string[]>
  /** Inbound attachments — name, content_type, content (base64), size, content_id. */
  attachments?: Array<{
    filename?: string
    content_type?: string
    content?: string // base64
    size?: number
    content_id?: string
  }>
  received_at?: string
}

export interface ParsedInbound {
  providerMsgId: string | null
  from: string
  recipients: string[]
  cc: string[]
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  threadKey: string | null
  attachments: Array<{ filename: string; size: number; contentType: string }>
}

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function lowerHeaders(h?: Record<string, string | string[]>): Record<string, string> {
  if (!h) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) {
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v
  }
  return out
}

/** Pull the first email address out of an RFC5322 header like `"Andy" <andy@...>`. */
export function extractAddress(s: string | undefined | null): string {
  if (!s) return ''
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim().toLowerCase()
}

/** Build a stable thread-key. Prefer References / In-Reply-To header chain;
 *  fall back to (from, subject normalised) so plain replies still cluster. */
export function buildThreadKey(payload: ResendInboundPayload): string | null {
  const headers = lowerHeaders(payload.headers)
  const refs = headers['references']
  const inReplyTo = headers['in-reply-to']
  if (refs) {
    // First message-id in the chain is the conversation root.
    const first = refs.split(/\s+/).find((s) => s.startsWith('<'))
    if (first) return first.replace(/[<>]/g, '')
  }
  if (inReplyTo) return inReplyTo.replace(/[<>]/g, '')
  // Fallback: hash of normalised subject. Strips leading "Re:" / "Fwd:".
  const subj = (payload.subject ?? '').replace(/^\s*(re|fwd?):\s*/gi, '').trim().toLowerCase()
  if (subj) return `subj:${subj.slice(0, 80)}`
  return null
}

export function parseResendInbound(payload: ResendInboundPayload): ParsedInbound {
  const from = extractAddress(payload.from)
  const to = asArray(payload.to).map(extractAddress).filter(Boolean)
  const cc = asArray(payload.cc).map(extractAddress).filter(Boolean)
  return {
    providerMsgId: payload.id ?? null,
    from,
    recipients: to,
    cc,
    subject: payload.subject ?? null,
    bodyText: payload.text ?? null,
    bodyHtml: payload.html ?? null,
    threadKey: buildThreadKey(payload),
    attachments: (payload.attachments ?? []).map((a) => ({
      filename: a.filename ?? 'attachment',
      size: a.size ?? 0,
      contentType: a.content_type ?? 'application/octet-stream',
    })),
  }
}
