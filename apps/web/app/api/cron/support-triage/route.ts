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

export const dynamic = 'force-dynamic'

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
