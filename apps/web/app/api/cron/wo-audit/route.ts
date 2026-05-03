/**
 * GET /api/cron/wo-audit  (Spec 5.5)
 *
 * Vercel Cron sweep — catches WOs that closed since the last tick but
 * never got audited (e.g. closed via direct DB update, status change
 * that bypassed the route hook, or a hook background-job that errored).
 *
 * Vercel Cron User-Agent guard per the 4.3 fix pattern: requests must
 * carry "vercel-cron/*" UA OR Authorization: Bearer <CRON_SECRET>.
 *
 * Idempotent: each call to auditWorkOrder upserts the same dedupe_key'd
 * card so re-running is harmless.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { auditWorkOrder } from '@/lib/ai/inspectors/wo-auditor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CLOSED_STATES = ['closed', 'invoiced', 'paid', 'archived']
const SWEEP_HOURS = 24
const MAX_PER_TICK = 25

function isVercelCronRequest(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCronRequest(req)) {
    return NextResponse.json({ error: 'Cron only' }, { status: 401 })
  }

  const service = createServiceSupabase()
  const since = new Date(Date.now() - SWEEP_HOURS * 3600 * 1000).toISOString()

  // Recently-closed WOs that don't already have an active audit card.
  // We can't do a single SQL with a NOT EXISTS subquery via the JS client
  // cleanly — instead pull the closed list, then for each check if a card
  // exists. Bounded by MAX_PER_TICK to stay within the 60s function cap.
  const { data: wos, error } = await service
    .from('work_orders')
    .select('id, organization_id, work_order_number, status, closed_at')
    .in('status', CLOSED_STATES)
    .gte('closed_at', since)
    .order('closed_at', { ascending: false })
    .limit(MAX_PER_TICK)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: Array<{ wo_id: string; status: string; finding_count?: number; error?: string }> = []
  for (const wo of (wos ?? []) as Array<{ id: string; organization_id: string; status: string }>) {
    // Skip if an active audit card already exists.
    const { data: existing } = await service
      .from('ai_action_cards')
      .select('id')
      .eq('organization_id', wo.organization_id)
      .eq('dedupe_key', `wo-audit:${wo.id}`)
      .is('dismissed_at', null)
      .is('resolved_at', null)
      .maybeSingle()
    if (existing) {
      results.push({ wo_id: wo.id, status: 'skipped-existing-card' })
      continue
    }

    try {
      const r = await auditWorkOrder(service, {
        work_order_id: wo.id,
        organization_id: wo.organization_id,
      })
      results.push({ wo_id: wo.id, status: 'audited', finding_count: r.finding_count })
    } catch (e) {
      results.push({ wo_id: wo.id, status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ swept: results.length, results })
}
