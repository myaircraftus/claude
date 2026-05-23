/**
 * GET /api/cron/duplicate-docs — daily at 04:30 UTC.
 *
 * Fires data-quality.duplicate-doc-detector. Surfaces cluster reports
 * in /admin/agents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { detectDuplicateDocs } from '@/lib/agents/impl/data-quality-duplicate-doc-detector'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

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
  const result = await detectDuplicateDocs({ supabase: service })
  return NextResponse.json({ ok: result.ok, run_id: result.runId, ...(result.output ?? {}) })
}
