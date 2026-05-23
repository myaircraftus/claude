/**
 * /api/cron/email-queue-worker — Phase 17 Sprint 17.1
 *
 * Vercel Cron entry point. Runs the email queue worker against
 * email_log: sends 'queued' rows via Resend, transitions them to
 * 'sent' or 'failed' (or back to 'queued' if a transient error
 * looks retriable). Default batch size 50; cron schedules in
 * apps/web/vercel.json fire this every minute.
 *
 * Auth: same shape as the other cron routes — accepts the
 * `x-vercel-cron` header that Vercel adds automatically, falls back
 * to CRON_SECRET via `?secret=…` query OR Authorization Bearer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { run } from '@/lib/email/queue-worker'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)))
  const service = createServiceSupabase()
  try {
    const result = await run(service, { maxBatch: limit })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'email queue tick failed' },
      { status: 500 },
    )
  }
}
