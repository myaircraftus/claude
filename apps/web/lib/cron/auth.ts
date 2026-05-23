/**
 * Shared cron-route authentication helper.
 *
 * Closes the two findings from the wave-2/3 security review:
 *
 *   1. The legacy pattern `if (req.headers.get('x-vercel-cron')) return true`
 *      trusts a request header that, while stripped at Vercel's edge for
 *      non-cron traffic, becomes a free bypass on any non-Vercel
 *      deployment. We now ALWAYS require CRON_SECRET, even on a Vercel
 *      cron-fired request (Vercel automatically sends
 *      `Authorization: Bearer $CRON_SECRET` when the env var is set, so
 *      this is forward-compatible).
 *
 *   2. We use crypto.timingSafeEqual instead of `===` to avoid the
 *      (low but real) timing oracle on the secret comparison.
 *
 *   3. Cron route handlers should return only counts in the JSON body —
 *      never the full recommendation/hits list — so that an
 *      auth-bypass cannot exfiltrate a multi-tenant snapshot of PII
 *      previews, org IDs, etc. The full output is already persisted to
 *      agent_runs and surfaced in /admin/agents under proper auth.
 *
 * Usage:
 *   if (!isCronAuthorized(req)) return cronUnauthorizedResponse()
 *   const result = await someAgent(...)
 *   return cronAckResponse(result)
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  // Same-length precondition for timingSafeEqual; pad to a fixed length
  // first to avoid the comparator-leaks-length pitfall.
  const aBuf = Buffer.from(a, 'utf8')
  const bBuf = Buffer.from(b, 'utf8')
  if (aBuf.length !== bBuf.length) {
    // Still do a constant-time compare against a zero-padded buffer so
    // attacker can't trivially length-oracle.
    timingSafeEqual(aBuf, Buffer.alloc(aBuf.length, 0))
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

export function isCronAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const query = req.nextUrl.searchParams.get('secret')
  const presented = bearer ?? query
  if (!presented) return false
  return safeEqual(presented, expected)
}

export function cronUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Return only counts / status — never the full recommendation payload.
 * The agent_runs row holds the detail under admin auth.
 *
 * Pass a small acknowledgement object: { run_id, ...summary_counts }.
 */
export function cronAckResponse(ack: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: true, ...ack })
}

export function cronErrorResponse(error: string, runId?: string): NextResponse {
  return NextResponse.json({ ok: false, run_id: runId, error }, { status: 500 })
}
