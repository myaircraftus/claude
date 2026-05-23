/**
 * GET /api/cron/pii-leak-scanner — hourly.
 *
 * Heuristic regex sweep over the trailing 65 minutes of inbox_messages
 * and ask_logs. Emits pii_redaction_review recommendations for any
 * matched SSN/credit-card/passport/account-number pattern. Never
 * stores the matched text — only a kind + redacted preview.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { scanForPiiLeaks } from '@/lib/agents/impl/safety-pii-leak-scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const presented =
    req.nextUrl.searchParams.get('secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return presented === expected
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await scanForPiiLeaks({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
