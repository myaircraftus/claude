/**
 * Phase 16 Sprint 16.6 — daily cost roll-up.
 *
 * Reads ai_activity_log (Anthropic spend already tracked in cents per
 * row), aggregates by date + source, upserts into cost_snapshots.
 * Modal + Stripe roll-ups are scaffolded with TODOs that read the
 * provider APIs when those credentials land — for v1 we record
 * "spend_cents=0" so the dashboard shows zeros rather than missing data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type CostSource = 'anthropic' | 'modal' | 'stripe' | 'vercel' | 'supabase' | 'other'

export interface CostSnapshot {
  id: string
  snapshot_date: string
  source: CostSource
  spend_cents: number
  unit_count: number | null
  unit_name: string | null
  metadata: Record<string, unknown>
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Roll up Anthropic spend from ai_activity_log for a given UTC date.
 * Each row already has cost_usd_cents from lib/ai/anthropic.ts; we just
 * sum + count tokens.
 */
export async function rollUpAnthropic(
  supabase: SupabaseClient,
  dateUtc: Date,
): Promise<{ spend_cents: number; tokens_in: number; tokens_out: number; calls: number }> {
  const dayStart = new Date(Date.UTC(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth(), dateUtc.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000)

  // ai_activity_log is keyed by created_at; sum cost_usd_cents.
  const { data, error } = await supabase
    .from('ai_activity_log')
    .select('cost_usd_cents, input_tokens, output_tokens')
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString())

  if (error) throw new Error(`rollUpAnthropic: ${error.message}`)

  const rows = (data ?? []) as Array<{ cost_usd_cents: number | null; input_tokens: number | null; output_tokens: number | null }>
  return rows.reduce(
    (acc, r) => ({
      spend_cents: acc.spend_cents + (r.cost_usd_cents ?? 0),
      tokens_in: acc.tokens_in + (r.input_tokens ?? 0),
      tokens_out: acc.tokens_out + (r.output_tokens ?? 0),
      calls: acc.calls + 1,
    }),
    { spend_cents: 0, tokens_in: 0, tokens_out: 0, calls: 0 },
  )
}

/**
 * Modal spend roll-up — scaffold. Real provider data via Modal API
 * once credentials land. For now: read vision_index_jobs completed in
 * the day to estimate spend at a fixed per-job rate.
 *
 * Estimate: $0.03 per Modal job = 3 cents (rough Modal A10G run).
 * This is a placeholder; flip to real billing when wired.
 */
export async function rollUpModal(
  supabase: SupabaseClient,
  dateUtc: Date,
): Promise<{ spend_cents: number; jobs: number }> {
  const dayStart = new Date(Date.UTC(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth(), dateUtc.getUTCDate()))
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000)

  const { count, error } = await supabase
    .from('vision_index_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('gpu_host', 'modal')
    .eq('status', 'completed')
    .gte('completed_at', dayStart.toISOString())
    .lt('completed_at', dayEnd.toISOString())

  if (error) throw new Error(`rollUpModal: ${error.message}`)

  const jobs = count ?? 0
  // Placeholder rate — see TODO above.
  const spend_cents = jobs * 3
  return { spend_cents, jobs }
}

/**
 * Upsert a cost snapshot. Re-running the roll-up replaces the day's
 * row (UNIQUE on snapshot_date + source).
 */
export async function upsertCostSnapshot(
  supabase: SupabaseClient,
  payload: {
    snapshot_date: string
    source: CostSource
    spend_cents: number
    unit_count?: number
    unit_name?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase
    .from('cost_snapshots')
    .upsert(
      {
        snapshot_date: payload.snapshot_date,
        source: payload.source,
        spend_cents: payload.spend_cents,
        unit_count: payload.unit_count ?? null,
        unit_name: payload.unit_name ?? null,
        metadata: payload.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'snapshot_date,source' },
    )
  if (error) throw new Error(`upsertCostSnapshot: ${error.message}`)
}

/**
 * Run all roll-ups for a single day. Idempotent.
 */
export async function rollUpDay(supabase: SupabaseClient, dateUtc: Date): Promise<{
  date: string
  totals: Record<CostSource, number>
}> {
  const date = ymd(dateUtc)

  const anthropic = await rollUpAnthropic(supabase, dateUtc)
  await upsertCostSnapshot(supabase, {
    snapshot_date: date,
    source: 'anthropic',
    spend_cents: anthropic.spend_cents,
    unit_count: anthropic.tokens_in + anthropic.tokens_out,
    unit_name: 'tokens',
    metadata: { calls: anthropic.calls, tokens_in: anthropic.tokens_in, tokens_out: anthropic.tokens_out },
  })

  const modal = await rollUpModal(supabase, dateUtc)
  await upsertCostSnapshot(supabase, {
    snapshot_date: date,
    source: 'modal',
    spend_cents: modal.spend_cents,
    unit_count: modal.jobs,
    unit_name: 'jobs',
    metadata: { rate_per_job_cents: 3, note: 'placeholder rate; wire real Modal billing in v2' },
  })

  // Stripe / Vercel / Supabase: provider APIs unavailable in v1.
  // Record zeros so the dashboard renders a complete picture.
  for (const source of ['stripe', 'vercel', 'supabase'] as CostSource[]) {
    await upsertCostSnapshot(supabase, {
      snapshot_date: date,
      source,
      spend_cents: 0,
      metadata: { placeholder: true, note: 'real provider not wired yet' },
    })
  }

  return {
    date,
    totals: {
      anthropic: anthropic.spend_cents,
      modal: modal.spend_cents,
      stripe: 0,
      vercel: 0,
      supabase: 0,
      other: 0,
    },
  }
}

/**
 * Read trailing N days of snapshots, summing across sources.
 */
export async function readTrailing(
  supabase: SupabaseClient,
  days: number,
): Promise<CostSnapshot[]> {
  const cutoff = ymd(new Date(Date.now() - days * 24 * 60 * 60_000))
  const { data, error } = await supabase
    .from('cost_snapshots')
    .select('*')
    .gte('snapshot_date', cutoff)
    .order('snapshot_date', { ascending: false })

  if (error) throw new Error(`readTrailing: ${error.message}`)
  return (data ?? []) as CostSnapshot[]
}

/**
 * Detect today's spend > 3x trailing-30d average → P0 cost spike alert.
 * Returns the rolled-up totals for the dashboard regardless of alert.
 */
export async function checkCostSpike(
  supabase: SupabaseClient,
): Promise<{
  today_cents: number
  trailing_30d_avg_cents: number
  spike: boolean
}> {
  const trailing = await readTrailing(supabase, 31)
  const today = ymd(new Date())
  const todayRows = trailing.filter((r) => r.snapshot_date === today)
  const todayCents = todayRows.reduce((acc, r) => acc + r.spend_cents, 0)

  // Trailing 30d EXCLUDING today.
  const olderRows = trailing.filter((r) => r.snapshot_date !== today)
  const dayBuckets = new Map<string, number>()
  for (const r of olderRows) {
    dayBuckets.set(r.snapshot_date, (dayBuckets.get(r.snapshot_date) ?? 0) + r.spend_cents)
  }
  const dailyTotals = [...dayBuckets.values()]
  const avg = dailyTotals.length
    ? dailyTotals.reduce((acc, v) => acc + v, 0) / dailyTotals.length
    : 0

  const spike = avg > 0 && todayCents > 3 * avg

  return {
    today_cents: todayCents,
    trailing_30d_avg_cents: Math.round(avg),
    spike,
  }
}
