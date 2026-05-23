/**
 * ops.cost-anomaly-detector
 *
 * Daily: walks agent_runs.tokens_in / tokens_out per organization
 * (via the triggered_by → user_profiles → org chain) for the last 14
 * days. Computes each org's rolling mean + stdev of daily spend (in
 * tokens). If yesterday's spend is ≥3σ above the 14-day baseline, emit
 * a 'cost_anomaly' recommendation so the founder can pause the
 * tenant's AI surfaces if it looks runaway.
 *
 * Pure SQL — no LLM, no external API calls. Tokens are a proxy for
 * dollars; the founder reads the report each morning.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface CostAnomalyEntry {
  organization_id: string
  yesterday_tokens: number
  baseline_mean_tokens: number
  baseline_stdev_tokens: number
  sigma: number
  agent_runs_yesterday: number
}

export interface CostAnomalyReport {
  scanned_orgs: number
  anomalies: CostAnomalyEntry[]
}

export async function detectCostAnomalies(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: CostAnomalyReport; runId?: string; error?: string }> {
  return runAgent<CostAnomalyReport>(
    'ops.cost-anomaly-detector',
    { supabase: args.supabase },
    async () => {
      // Pull last 14 days of runs with token usage + a triggered_by → org link.
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: runs } = await args.supabase
        .from('agent_runs')
        .select('triggered_by, tokens_in, tokens_out, created_at')
        .gte('created_at', since)
        .not('triggered_by', 'is', null)
        .limit(50000)

      // Map triggered_by → organization_id via memberships (first org).
      const triggerIds = Array.from(
        new Set((runs ?? []).map((r) => r.triggered_by as string).filter(Boolean)),
      )
      const orgByUser = new Map<string, string>()
      if (triggerIds.length > 0) {
        const { data: memberships } = await args.supabase
          .from('organization_memberships')
          .select('user_id, organization_id')
          .in('user_id', triggerIds)
          .not('accepted_at', 'is', null)
        for (const m of (memberships ?? []) as Array<{ user_id: string; organization_id: string }>) {
          if (!orgByUser.has(m.user_id)) orgByUser.set(m.user_id, m.organization_id)
        }
      }

      // Bucket tokens by (org_id, dayKey)
      const buckets = new Map<string, Map<string, { tokens: number; runs: number }>>()
      for (const row of (runs ?? []) as Array<{
        triggered_by: string
        tokens_in: number | null
        tokens_out: number | null
        created_at: string
      }>) {
        const orgId = orgByUser.get(row.triggered_by)
        if (!orgId) continue
        const day = row.created_at.slice(0, 10) // YYYY-MM-DD
        const tok = (row.tokens_in ?? 0) + (row.tokens_out ?? 0)
        let perOrg = buckets.get(orgId)
        if (!perOrg) {
          perOrg = new Map()
          buckets.set(orgId, perOrg)
        }
        const slot = perOrg.get(day) ?? { tokens: 0, runs: 0 }
        slot.tokens += tok
        slot.runs += 1
        perOrg.set(day, slot)
      }

      const yesterdayKey = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const anomalies: CostAnomalyEntry[] = []
      for (const [orgId, days] of buckets.entries()) {
        const baselineDays = Array.from(days.entries())
          .filter(([d]) => d !== yesterdayKey)
          .map(([, v]) => v.tokens)
        if (baselineDays.length < 3) continue // need at least 3 prior days
        const mean = baselineDays.reduce((a, b) => a + b, 0) / baselineDays.length
        const variance =
          baselineDays.reduce((s, x) => s + (x - mean) ** 2, 0) / baselineDays.length
        const stdev = Math.sqrt(variance)
        const yesterdaySlot = days.get(yesterdayKey)
        if (!yesterdaySlot) continue
        const sigma = stdev === 0 ? 0 : (yesterdaySlot.tokens - mean) / stdev
        if (sigma >= 3) {
          anomalies.push({
            organization_id: orgId,
            yesterday_tokens: yesterdaySlot.tokens,
            baseline_mean_tokens: Math.round(mean),
            baseline_stdev_tokens: Math.round(stdev),
            sigma: Math.round(sigma * 10) / 10,
            agent_runs_yesterday: yesterdaySlot.runs,
          })
        }
      }
      anomalies.sort((a, b) => b.sigma - a.sigma)

      return {
        output: { scanned_orgs: buckets.size, anomalies },
        needsHuman: anomalies.length > 0,
        recommendation:
          anomalies.length > 0
            ? { kind: 'cost_anomaly', anomalies }
            : null,
      }
    },
  )
}
