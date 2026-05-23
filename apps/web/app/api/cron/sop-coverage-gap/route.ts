/**
 * GET /api/cron/sop-coverage-gap — weekly, Monday 06:00 UTC.
 *
 * Buckets the last 7 days of inbound support questions (support_tickets +
 * launcher chat). For any high-frequency bucket without a matching
 * published KB entry, emits a 'sop_gap' recommendation so the founder
 * knows which SOPs to write next. Pure SQL — no LLM.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectSopCoverageGaps } from '@/lib/agents/impl/knowledge-sop-coverage-gap-detector'

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
  const result = await detectSopCoverageGaps({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
