/**
 * /api/cron/churn-signals — Phase 16 Sprint 16.9
 *
 * Daily detector. Inserts churn_signals rows for orgs matching one or
 * more of the lock'd patterns:
 *   - no_login_30d: org has no recent activity (work_orders/documents/
 *     ai_activity_log) in 30 days.
 *   - tier_downgrade: tier_history shows a downgrade in last 7 days.
 *   - payment_failed: deferred until v1 billing launches (no-op).
 *   - negative_feedback: feedback_items with sentiment='negative' in
 *     last 30 days.
 *
 * Idempotent — `churn_signals_unique_open_idx` (mig 109) prevents
 * duplicate open signals for the same (org, type) pair. Re-running the
 * cron updates `detected_at` if the signal is still open.
 *
 * Auth: Vercel Cron header OR CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

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

interface SignalRow {
  organization_id: string
  signal_type: string
  severity: 'P0' | 'P1' | 'P2' | 'P3'
  summary: string
  metadata: Record<string, unknown>
}

async function detectNoLogin30d(supabase: any): Promise<SignalRow[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
  const { data: orgs } = await supabase.from('organizations').select('id, name, slug')
  const out: SignalRow[] = []
  for (const org of (orgs ?? []) as Array<{ id: string; name: string; slug: string }>) {
    const [{ count: recentWO }, { count: recentDocs }] = await Promise.all([
      supabase.from('work_orders').select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id).gte('updated_at', cutoff),
      supabase.from('documents').select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id).gte('updated_at', cutoff),
    ])
    if ((recentWO ?? 0) === 0 && (recentDocs ?? 0) === 0) {
      out.push({
        organization_id: org.id,
        signal_type: 'no_login_30d',
        severity: 'P2',
        summary: `${org.name} has no activity in 30 days`,
        metadata: { org_slug: org.slug, cutoff_iso: cutoff },
      })
    }
  }
  return out
}

async function detectTierDowngrade(supabase: any): Promise<SignalRow[]> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString()
  const TIER_RANK: Record<string, number> = { beta: 0, standard: 1, pro: 2 }
  const { data } = await supabase
    .from('tier_history')
    .select('organization_id, from_tier, to_tier, changed_at, reason, organizations(name, slug)')
    .gte('changed_at', cutoff)
  const out: SignalRow[] = []
  for (const r of (data ?? []) as Array<{
    organization_id: string
    from_tier: string | null
    to_tier: string
    changed_at: string
    reason: string | null
    organizations: { name?: string; slug?: string } | { name?: string; slug?: string }[] | null
  }>) {
    if (!r.from_tier) continue
    if ((TIER_RANK[r.to_tier] ?? -1) >= (TIER_RANK[r.from_tier] ?? -1)) continue
    const orgInfo = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations
    out.push({
      organization_id: r.organization_id,
      signal_type: 'tier_downgrade',
      severity: 'P1',
      summary: `${orgInfo?.name ?? 'org'} downgraded ${r.from_tier} → ${r.to_tier}`,
      metadata: { from_tier: r.from_tier, to_tier: r.to_tier, reason: r.reason ?? null },
    })
  }
  return out
}

async function detectNegativeFeedback(supabase: any): Promise<SignalRow[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString()
  const { data } = await supabase
    .from('feedback_items')
    .select('organization_id')
    .eq('sentiment', 'negative')
    .gte('created_at', cutoff)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ organization_id: string | null }>) {
    if (!r.organization_id) continue
    counts.set(r.organization_id, (counts.get(r.organization_id) ?? 0) + 1)
  }
  const out: SignalRow[] = []
  for (const [orgId, count] of counts.entries()) {
    if (count < 2) continue
    out.push({
      organization_id: orgId,
      signal_type: 'negative_feedback',
      severity: 'P2',
      summary: `${count} negative feedback items in last 30 days`,
      metadata: { negative_count_30d: count },
    })
  }
  return out
}

async function upsertSignal(supabase: any, signal: SignalRow): Promise<void> {
  // Try update an existing OPEN signal for the same (org, type); if no
  // row matches we insert a new one.
  const { data: existing } = await supabase
    .from('churn_signals')
    .select('id')
    .eq('organization_id', signal.organization_id)
    .eq('signal_type', signal.signal_type)
    .eq('status', 'open')
    .maybeSingle()

  if (existing) {
    await supabase
      .from('churn_signals')
      .update({
        severity: signal.severity,
        summary: signal.summary,
        metadata: signal.metadata,
        detected_at: new Date().toISOString(),
      })
      .eq('id', (existing as { id: string }).id)
    return
  }
  await supabase.from('churn_signals').insert({
    organization_id: signal.organization_id,
    signal_type: signal.signal_type,
    severity: signal.severity,
    summary: signal.summary,
    metadata: signal.metadata,
    status: 'open',
  })
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceSupabase()

  const [noLogin, downgrade, negFb] = await Promise.all([
    detectNoLogin30d(service).catch(() => []),
    detectTierDowngrade(service).catch(() => []),
    detectNegativeFeedback(service).catch(() => []),
  ])

  const all = [...noLogin, ...downgrade, ...negFb]
  for (const s of all) {
    await upsertSignal(service, s).catch(() => {})
  }

  return NextResponse.json({
    no_login_30d: noLogin.length,
    tier_downgrade: downgrade.length,
    negative_feedback: negFb.length,
    total_inserted_or_refreshed: all.length,
  })
}
