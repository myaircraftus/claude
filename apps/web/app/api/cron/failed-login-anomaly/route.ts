/**
 * GET /api/cron/failed-login-anomaly — every 10 minutes.
 *
 * Reads auth.audit_log_entries and flags burst-style failed-sign-in
 * patterns. Emits a critical recommendation surfaced in /admin/agents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectFailedLoginAnomalies } from '@/lib/agents/impl/security-failed-login-anomaly'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await detectFailedLoginAnomalies({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
