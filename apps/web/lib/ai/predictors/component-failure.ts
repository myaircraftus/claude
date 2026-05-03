/**
 * Component failure predictor (Spec 5.3, heuristic).
 *
 * Reads aircraft.total_time_hours + reserve TBO defaults from
 * lib/costs/reserves.ts. Risk score is a smooth function of
 * (hours-to-TBO / TBO):
 *
 *   pct_used = total_time / engineTBO  (clamped 0..1)
 *   risk     = round(pct_used * 100)
 *
 * Without a per-aircraft "engine_overhaul_total_time" column today we
 * use total_time_hours as the time-since-overhaul proxy (same
 * simplification as 7.5 ReserveStatusCard). Logged 7.5 follow-up:
 * read maintenance_events tagged 'engine_overhaul' and compute the delta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeEngineReserve, computePropReserve } from '@/lib/costs/reserves'
import type { PredictionResult } from './types'

export interface ComponentFailureInput {
  organization_id: string
  aircraft_id: string
}

export async function predictComponentFailure(
  supabase: SupabaseClient,
  input: ComponentFailureInput,
): Promise<PredictionResult> {
  const { data: row } = await supabase
    .from('aircraft')
    .select('total_time_hours')
    .eq('organization_id', input.organization_id)
    .eq('id', input.aircraft_id)
    .maybeSingle()
  const tt = (row as { total_time_hours: number | null } | null)?.total_time_hours ?? null

  if (tt == null || tt <= 0) {
    return {
      kind: 'component-failure',
      headline: 'Total time hours not recorded — cannot compute component risk.',
      evidence: [],
      priority: 'low',
      confidence: 0,
      insufficientData: true,
    }
  }

  const engine = computeEngineReserve()
  const prop = computePropReserve()
  const engineUsed = Math.min(1, tt / engine.tboHours)
  const propUsed = Math.min(1, tt / prop.tboHours)
  const engineRisk = Math.round(engineUsed * 100)
  const propRisk = Math.round(propUsed * 100)
  const worstRisk = Math.max(engineRisk, propRisk)
  const worstWhich = engineRisk >= propRisk ? 'engine' : 'prop'

  const overdue = engineUsed >= 1 || propUsed >= 1
  const dueSoon = !overdue && (engineUsed >= 0.85 || propUsed >= 0.85)

  return {
    kind: 'component-failure',
    headline: overdue
      ? `${worstWhich.charAt(0).toUpperCase() + worstWhich.slice(1)} OVERDUE — past TBO at ${tt.toFixed(0)} hr.`
      : dueSoon
        ? `${worstWhich.charAt(0).toUpperCase() + worstWhich.slice(1)} approaching TBO — ${worstRisk}% used.`
        : `Components within service envelope (${worstRisk}% of TBO used).`,
    evidence: [
      `Total time: ${tt.toFixed(1)} hr.`,
      `Engine: ${engineRisk}% of ${engine.tboHours.toLocaleString()}-hr default TBO.`,
      `Prop: ${propRisk}% of ${prop.tboHours.toLocaleString()}-hr default TBO.`,
      engine.isDefault ? 'Using default engine TBO — set per-aircraft override for accuracy.' : '',
    ].filter(Boolean) as string[],
    priority: overdue ? 'urgent' : dueSoon ? 'high' : 'low',
    confidence: 0.75,
    cta: overdue || dueSoon ? {
      label: `Schedule ${worstWhich} overhaul review`,
      tool: 'create-work-order',
      args: {
        aircraft_id: input.aircraft_id,
        scope: `${worstWhich.charAt(0).toUpperCase() + worstWhich.slice(1)} overhaul scheduling — component-failure predictor flagged ${worstRisk}% of TBO consumed`,
      },
    } : undefined,
  }
}
