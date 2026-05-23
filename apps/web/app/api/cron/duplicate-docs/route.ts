/**
 * GET /api/cron/duplicate-docs — daily at 04:30 UTC.
 *
 * Fires data-quality.duplicate-doc-detector. Surfaces cluster reports
 * in /admin/agents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectDuplicateDocs } from '@/lib/agents/impl/data-quality-duplicate-doc-detector'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 180


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const service = createServiceSupabase()
  const result = await detectDuplicateDocs({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
