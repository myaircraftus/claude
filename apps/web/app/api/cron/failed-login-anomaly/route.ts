/**
 * GET /api/cron/failed-login-anomaly — every 10 minutes.
 *
 * Reads auth.audit_log_entries and flags burst-style failed-sign-in
 * patterns. Emits a critical recommendation surfaced in /admin/agents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectFailedLoginAnomalies } from '@/lib/agents/impl/security-failed-login-anomaly'

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
  const result = await detectFailedLoginAnomalies({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
