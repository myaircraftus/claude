/**
 * Oil consumption predictor (Spec 5.3, heuristic).
 *
 * Reads cost_entries.category='oil' (sprint 7.1) for the aircraft +
 * flight_events (sprint 4.3) airborne_hours over the same window.
 * Heuristic: quarts-per-hour rate vs the aircraft's all-time baseline.
 * If recent 30d rate >= 2× the all-time baseline AND the recent rate
 * is above 1 qt/hr, flag as anomaly.
 *
 * Without a per-line "quantity" column on cost_entries today we use
 * dollars-per-hour as a proxy (oil cost roughly tracks quarts at a
 * stable price). Switch to qty when the column lands.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PredictionResult } from './types'

export interface OilConsumptionInput {
  organization_id: string
  aircraft_id: string
}

const RECENT_WINDOW_DAYS = 30
const BASELINE_LOOKBACK_DAYS = 365
const ANOMALY_RATIO = 2.0

export async function predictOilConsumption(
  supabase: SupabaseClient,
  input: OilConsumptionInput,
): Promise<PredictionResult> {
  const recentSince = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const baselineSince = new Date(Date.now() - BASELINE_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)

  const [{ data: oilEntries }, { data: flights }] = await Promise.all([
    supabase
      .from('cost_entries')
      .select('amount, cost_date')
      .eq('organization_id', input.organization_id)
      .eq('aircraft_id', input.aircraft_id)
      .eq('category', 'oil')
      .eq('approved', true)
      .gte('cost_date', baselineSince),
    supabase
      .from('flight_events')
      .select('airborne_hours, start_time')
      .eq('organization_id', input.organization_id)
      .eq('aircraft_id', input.aircraft_id)
      .gte('start_time', new Date(Date.now() - BASELINE_LOOKBACK_DAYS * 86_400_000).toISOString()),
  ])

  const oils = (oilEntries ?? []) as Array<{ amount: number; cost_date: string }>
  const flightRows = (flights ?? []) as Array<{ airborne_hours: number; start_time: string }>

  if (oils.length < 3 || flightRows.length === 0) {
    return {
      kind: 'oil-consumption',
      headline: 'Insufficient oil + flight history for trend.',
      evidence: [],
      priority: 'low',
      confidence: 0,
      insufficientData: true,
    }
  }

  const recentOilSpend = oils.filter((r) => r.cost_date >= recentSince).reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const allTimeOilSpend = oils.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const recentHours = flightRows
    .filter((f) => f.start_time >= new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString())
    .reduce((s, f) => s + (Number.isFinite(f.airborne_hours) ? Number(f.airborne_hours) : 0), 0)
  const allTimeHours = flightRows.reduce((s, f) => s + (Number.isFinite(f.airborne_hours) ? Number(f.airborne_hours) : 0), 0)

  if (recentHours <= 0 || allTimeHours <= 0) {
    return {
      kind: 'oil-consumption',
      headline: 'No flight hours in the lookback window.',
      evidence: [],
      priority: 'low',
      confidence: 0.4,
      insufficientData: true,
    }
  }

  const recentRate = recentOilSpend / recentHours      // $/hr proxy for qts/hr
  const baselineRate = allTimeOilSpend / allTimeHours
  const ratio = baselineRate > 0 ? recentRate / baselineRate : 1
  const anomaly = ratio >= ANOMALY_RATIO && recentRate >= 1

  return {
    kind: 'oil-consumption',
    headline: anomaly
      ? `Oil consumption ${ratio.toFixed(1)}× baseline over the last ${RECENT_WINDOW_DAYS} days.`
      : `Oil consumption tracking baseline (${ratio.toFixed(2)}×).`,
    evidence: [
      `Recent ${RECENT_WINDOW_DAYS}d: $${recentOilSpend.toFixed(2)} / ${recentHours.toFixed(1)} hr = $${recentRate.toFixed(2)}/hr`,
      `All-time: $${allTimeOilSpend.toFixed(2)} / ${allTimeHours.toFixed(1)} hr = $${baselineRate.toFixed(2)}/hr`,
      `Anomaly threshold: ≥ ${ANOMALY_RATIO}× baseline AND ≥ $1/hr (qty proxy).`,
    ],
    priority: anomaly ? 'high' : 'low',
    confidence: anomaly ? 0.75 : 0.55,
    cta: anomaly ? {
      label: 'Open work order',
      tool: 'create-work-order',
      args: { aircraft_id: input.aircraft_id, scope: 'Investigate elevated oil consumption — predicted anomaly' },
    } : undefined,
  }
}
