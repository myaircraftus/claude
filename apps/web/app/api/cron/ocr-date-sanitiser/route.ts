/**
 * /api/cron/ocr-date-sanitiser — nightly OCR date sweep.
 *
 * Nulls page_tree_nodes.date_iso when it's outside the legal range
 * (aircraft.year - 1 → today + 1y). The same range is enforced at
 * query time elsewhere — this is the at-rest version so an
 * eyeballed search doesn't return "1923-04-08" entries on a 1968
 * aircraft.
 *
 * Schedule (per lib/agents/registry.ts): 03:00 UTC daily.
 *
 * Supports ?dry_run=1 to count without writing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { sanitiseOcrDates } from '@/lib/agents/impl/data-quality-ocr-date-sanitiser'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'
  const service = createServiceSupabase()
  const result = await sanitiseOcrDates({ supabase: service, dryRun })
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? 'sanitiser failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({ ok: true, run_id: result.runId, ...(result.output ?? {}) })
}
