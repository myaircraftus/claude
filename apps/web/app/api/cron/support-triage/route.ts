/**
 * /api/cron/support-triage — Phase 16 Sprint 16.3
 *
 * Vercel Cron entry point. Picks up the oldest un-triaged tickets
 * (status='new') and runs lib/support/ai-triage.ts → triageBatch
 * against each. Default: 10 tickets per tick. Cron schedule
 * (vercel.json) configured to run every 30s.
 *
 * Auth: cron secret in CRON_SECRET env var, presented as
 * `?secret=<TOKEN>` query OR `Authorization: Bearer <TOKEN>` header.
 * In Vercel, the cron infrastructure adds an `x-vercel-cron` header
 * automatically — we accept that as proof too.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { triageBatch } from '@/lib/support/ai-triage'
// Cron auth — constant-time secret check, always requires CRON_SECRET
// even on a Vercel-fired request (Vercel sends Authorization: Bearer
// $CRON_SECRET automatically). See lib/cron/auth.ts.
import { isCronAuthorized as isAuthorized } from '@/lib/cron/auth'

export const dynamic = 'force-dynamic'


export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 10)))

  const service = createServiceSupabase()
  try {
    const results = await triageBatch(service, limit)
    return NextResponse.json({
      processed: results.length,
      auto_resolved: results.filter((r) => r.auto_resolved).length,
      escalated: results.filter((r) => r.escalated).length,
      results: results.map((r) => ({
        ticket_id: r.ticket_id,
        action: r.action,
        confidence: r.confidence,
        category: r.classification.category,
        severity: r.classification.severity,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'triage failed' },
      { status: 500 },
    )
  }
}
