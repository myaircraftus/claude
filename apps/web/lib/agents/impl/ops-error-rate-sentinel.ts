/**
 * ops.error-rate-sentinel
 *
 * Hourly probe of error / log signals in our own DB. We do NOT call
 * Sentry's API directly here — that needs a SENTRY_AUTH_TOKEN we
 * haven't provisioned yet. Instead we tail two tables:
 *
 *   - agent_runs.status='failed' in the last hour vs the trailing
 *     7-day baseline (per-hour)
 *   - alert_events.severity='P0' / 'P1' opened in the last hour
 *
 * For agent_runs, we compute the failure rate over the last hour and
 * flag when it exceeds 3x the trailing-7d hourly average AND >= 5
 * failures in the hour. The 3x ratio mirrors cost-anomaly's sigma
 * threshold but without requiring a normal distribution.
 *
 * Sentry API integration is a follow-on once SENTRY_AUTH_TOKEN is
 * provisioned. For now this gives us the "something is breaking in
 * the agent fleet right now" signal we need.
 *
 * Emits 'error_rate_spike' recommendation marked critical when
 * triggered. Pure SQL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ErrorRateReport {
  window_hours: number
  failures_last_hour: number
  failures_baseline_per_hour: number
  ratio: number
  p0_alerts: number
  p1_alerts: number
  spike: boolean
  notes: string[]
}

const HOUR_MS = 60 * 60 * 1000

export async function checkErrorRate(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: ErrorRateReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<ErrorRateReport>(
    'ops.error-rate-sentinel',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const lastHour = new Date(asOf.getTime() - HOUR_MS).toISOString()
      const sevenDaysAgo = new Date(asOf.getTime() - 7 * 24 * HOUR_MS).toISOString()
      const [lastHourFails, baselineFails, p0, p1] = await Promise.all([
        args.supabase
          .from('agent_runs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('created_at', lastHour),
        args.supabase
          .from('agent_runs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed')
          .gte('created_at', sevenDaysAgo)
          .lt('created_at', lastHour),
        args.supabase
          .from('alert_events')
          .select('id', { count: 'exact', head: true })
          .eq('severity', 'P0')
          .eq('status', 'firing')
          .gte('fired_at', lastHour),
        args.supabase
          .from('alert_events')
          .select('id', { count: 'exact', head: true })
          .eq('severity', 'P1')
          .eq('status', 'firing')
          .gte('fired_at', lastHour),
      ])
      const lastHourCount = lastHourFails.count ?? 0
      const baselineTotal = baselineFails.count ?? 0
      const baselinePerHour = baselineTotal / (7 * 24)
      const ratio = baselinePerHour > 0 ? lastHourCount / baselinePerHour : lastHourCount
      const spike = lastHourCount >= 5 && ratio >= 3
      const notes: string[] = []
      if (spike) {
        notes.push(
          `agent_runs failures last hour=${lastHourCount} vs baseline ${baselinePerHour.toFixed(2)}/h (ratio ${ratio.toFixed(1)}x)`,
        )
      }
      if ((p0.count ?? 0) > 0) notes.push(`${p0.count} P0 alerts firing`)
      if ((p1.count ?? 0) > 0) notes.push(`${p1.count} P1 alerts firing`)
      const triggered = spike || (p0.count ?? 0) > 0
      return {
        output: {
          window_hours: 1,
          failures_last_hour: lastHourCount,
          failures_baseline_per_hour: baselinePerHour,
          ratio,
          p0_alerts: p0.count ?? 0,
          p1_alerts: p1.count ?? 0,
          spike,
          notes,
        },
        needsHuman: triggered,
        recommendation: triggered
          ? {
              kind: 'error_rate_spike',
              severity: (p0.count ?? 0) > 0 ? 'critical' : 'high',
              failures_last_hour: lastHourCount,
              ratio: Number(ratio.toFixed(2)),
              p0_alerts: p0.count ?? 0,
              p1_alerts: p1.count ?? 0,
              notes,
            }
          : null,
      }
    },
  )
}
