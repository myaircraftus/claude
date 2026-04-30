/**
 * GET /api/admin/ingestion-health
 *
 * Backend for the /admin/ingestion-health dashboard. Aggregates rows from
 * the `ingestion_failures` log into:
 *
 *   - Per-tag rollup (count last 24h / 7d / total, recovery rate)
 *   - List of "unknown" classifier rows (the patterns we haven't seen yet
 *     and need to add to the classifier)
 *   - Per-doc summary for the most recent failures so we can drill in
 *
 * Platform-admin only. The /admin layout already gates on is_platform_admin
 * but we double-check here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Per-tag rollup over the last 7 days.
  type FailureRow = {
    classifier_tag: string
    severity: string
    outcome: string
    occurred_at: string
    document_id: string
    error_message: string
  }

  const { data: failures } = await service
    .from('ingestion_failures')
    .select('classifier_tag, severity, outcome, occurred_at, document_id, error_message')
    .gte('occurred_at', since7d)
    .order('occurred_at', { ascending: false })
    .limit(2000)

  const rows: FailureRow[] = (failures ?? []) as FailureRow[]

  type TagSummary = {
    tag: string
    severity: string
    total_7d: number
    last_24h: number
    recovered: number
    failed_open: number
    gave_up: number
    last_occurred_at: string | null
    sample_message: string | null
  }

  const byTag = new Map<string, TagSummary>()
  for (const r of rows) {
    const cur = byTag.get(r.classifier_tag) ?? {
      tag: r.classifier_tag,
      severity: r.severity,
      total_7d: 0,
      last_24h: 0,
      recovered: 0,
      failed_open: 0,
      gave_up: 0,
      last_occurred_at: null,
      sample_message: null,
    }
    cur.total_7d += 1
    if (r.occurred_at >= since24h) cur.last_24h += 1
    if (r.outcome === 'recovered') cur.recovered += 1
    else if (r.outcome === 'gave_up') cur.gave_up += 1
    else cur.failed_open += 1
    if (!cur.last_occurred_at || r.occurred_at > cur.last_occurred_at) {
      cur.last_occurred_at = r.occurred_at
      cur.sample_message = r.error_message
    }
    byTag.set(r.classifier_tag, cur)
  }

  // Most recent unknowns — the rows we want to convert into a known pattern.
  const unknowns = rows
    .filter((r) => r.classifier_tag === 'unknown')
    .slice(0, 50)
    .map((r) => ({
      document_id: r.document_id,
      occurred_at: r.occurred_at,
      error_message: r.error_message,
      outcome: r.outcome,
    }))

  return NextResponse.json({
    summary: {
      total_7d: rows.length,
      last_24h: rows.filter((r) => r.occurred_at >= since24h).length,
      recovered_7d: rows.filter((r) => r.outcome === 'recovered').length,
      gave_up_7d: rows.filter((r) => r.outcome === 'gave_up').length,
      unknown_patterns: byTag.get('unknown')?.total_7d ?? 0,
    },
    by_tag: Array.from(byTag.values()).sort((a, b) => b.last_24h - a.last_24h),
    recent_unknowns: unknowns,
  })
}
