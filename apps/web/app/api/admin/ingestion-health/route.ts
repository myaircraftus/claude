/**
 * GET /api/admin/ingestion-health
 *
 * Backend for the /admin/ingestion-health dashboard. Returns:
 *   - 24h / 7d summary (totals, recovered, gave-up, unknown count)
 *   - Per-classifier-tag rollup with the failure rows nested inside so the
 *     UI can render an expandable tag → failures tree.
 *   - Per-failure aircraft / doc-title context so the operator can recognize
 *     which file each row corresponds to without a separate lookup.
 *
 * Platform-admin only. The /admin layout already gates on is_platform_admin
 * but we double-check here for defense in depth.
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

  type FailureRow = {
    id: string
    classifier_tag: string
    severity: string
    outcome: string
    occurred_at: string
    document_id: string
    error_message: string
    pipeline_stage: string | null
    attempt_number: number
  }

  const { data: failures } = await service
    .from('ingestion_failures')
    .select('id, classifier_tag, severity, outcome, occurred_at, document_id, error_message, pipeline_stage, attempt_number')
    .gte('occurred_at', since7d)
    .order('occurred_at', { ascending: false })
    .limit(2000)

  const rows: FailureRow[] = (failures ?? []) as FailureRow[]

  // Hydrate doc title + tail-number for every failure so the UI can show
  // "N89114 / 10_N89114_Binder.pdf" instead of just a UUID.
  const docIds = Array.from(new Set(rows.map((r) => r.document_id)))
  const docMeta = new Map<string, { title: string; tail: string | null; status: string }>()
  if (docIds.length > 0) {
    const { data: docs } = await service
      .from('documents')
      .select('id, title, parsing_status, aircraft:aircraft_id(tail_number)')
      .in('id', docIds)
    for (const d of docs ?? []) {
      const tail =
        Array.isArray((d as any).aircraft)
          ? (d as any).aircraft[0]?.tail_number ?? null
          : (d as any).aircraft?.tail_number ?? null
      docMeta.set(d.id as string, {
        title: (d as any).title ?? 'Untitled',
        tail,
        status: (d as any).parsing_status ?? 'unknown',
      })
    }
  }

  type EnrichedFailure = FailureRow & {
    document_title: string
    aircraft_tail: string | null
    current_doc_status: string
  }

  const enriched: EnrichedFailure[] = rows.map((r) => {
    const meta = docMeta.get(r.document_id)
    return {
      ...r,
      document_title: meta?.title ?? 'Untitled',
      aircraft_tail: meta?.tail ?? null,
      current_doc_status: meta?.status ?? 'unknown',
    }
  })

  type TagSummary = {
    tag: string
    severity: string
    total_7d: number
    last_24h: number
    recovered: number
    failed_open: number
    gave_up: number
    last_occurred_at: string | null
    failures: EnrichedFailure[]
  }

  const byTag = new Map<string, TagSummary>()
  for (const r of enriched) {
    const cur = byTag.get(r.classifier_tag) ?? {
      tag: r.classifier_tag,
      severity: r.severity,
      total_7d: 0,
      last_24h: 0,
      recovered: 0,
      failed_open: 0,
      gave_up: 0,
      last_occurred_at: null,
      failures: [],
    }
    cur.total_7d += 1
    if (r.occurred_at >= since24h) cur.last_24h += 1
    if (r.outcome === 'recovered') cur.recovered += 1
    else if (r.outcome === 'gave_up') cur.gave_up += 1
    else cur.failed_open += 1
    if (!cur.last_occurred_at || r.occurred_at > cur.last_occurred_at) {
      cur.last_occurred_at = r.occurred_at
    }
    cur.failures.push(r)
    byTag.set(r.classifier_tag, cur)
  }

  return NextResponse.json({
    summary: {
      total_7d: enriched.length,
      last_24h: enriched.filter((r) => r.occurred_at >= since24h).length,
      recovered_7d: enriched.filter((r) => r.outcome === 'recovered').length,
      gave_up_7d: enriched.filter((r) => r.outcome === 'gave_up').length,
      unknown_patterns: byTag.get('unknown')?.total_7d ?? 0,
    },
    by_tag: Array.from(byTag.values()).sort((a, b) => b.last_24h - a.last_24h),
    recent_failures: enriched.slice(0, 100),
  })
}
