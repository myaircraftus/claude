/**
 * GET /api/cron/cert-expiry — daily at 08:00 UTC.
 *
 * Fires workforce.cert-expiry-alerter to scan mechanic_certificates
 * for renewals due in the next 60 days. Emits cert_expiry_soon
 * recommendation rows that /admin/agents surfaces.
 *
 * Same shared-secret auth as the other cron routes.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { alertCertExpiries } from '@/lib/agents/impl/workforce-cert-expiry-alerter'
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
  const result = await alertCertExpiries({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
