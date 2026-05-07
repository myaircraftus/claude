/**
 * Multi-source telemetry inference engine (Spec 4.4 — stub layer).
 *
 * For an aircraft with multiple configured telemetry sources (Airbly +
 * FSP + ADSB-Exchange + manual), pulls each source's recent flights,
 * dedupes overlapping flight events, applies SOURCE_PRIORITY (sprint
 * 7.8) to pick the winning meter delta per flight, and writes the
 * winning Hobbs/Tach as a meter_readings row.
 *
 * Priority tiers (higher wins):
 *   uploaded(4) — Airbly direct device
 *   connected(3) — FSP, vendor integration
 *   tracked(2)   — ADSB-Exchange (inferred)
 *   estimated(1) — heuristic / manual fallback
 *
 * Lower-priority sources still get logged as alternates via
 * source_overrides (sprint 7.8) so the audit trail captures every
 * conflict, even when the higher-priority source wins.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSourcePriority } from '@/lib/source-priority'
import { recordOverride } from '@/lib/source-priority/audit'

export interface InferenceCandidate {
  source: 'airbly' | 'fsp' | 'adsb-exchange' | 'flightaware' | 'manual'
  /** Anchor time used for de-duping windows. Typically flight start_time. */
  anchor_time: string
  airborne_hours: number
  hobbs_delta: number | null
  tach_delta: number | null
  /** 0–1 self-reported confidence. */
  confidence: number
  /** Provenance — useful for the override audit row. */
  raw_id?: string
}

export interface InferenceInput {
  organization_id: string
  aircraft_id: string
  candidates: InferenceCandidate[]
  /** Window (minutes) within which two candidates count as "same flight". */
  dedup_window_minutes?: number
}

export interface InferenceWinner {
  source: InferenceCandidate['source']
  airborne_hours: number
  hobbs_delta: number | null
  tach_delta: number | null
  confidence: number
  /** All sources that reported the same flight, including the winner. */
  alternates: Array<{ source: InferenceCandidate['source']; confidence: number; priority: number }>
}

/**
 * Pure function — group candidates into flight clusters then pick a
 * winner per cluster by source priority. Caller does the DB writes
 * (meter_readings + source_overrides).
 */
export function inferFromCandidates(input: InferenceInput): InferenceWinner[] {
  const window = (input.dedup_window_minutes ?? 30) * 60 * 1000
  const sorted = input.candidates
    .filter((c) => Number.isFinite(Date.parse(c.anchor_time)))
    .sort((a, b) => Date.parse(a.anchor_time) - Date.parse(b.anchor_time))

  // Greedy clustering: start a new cluster when the next candidate's
  // anchor is more than `window` ms after the cluster's last anchor.
  const clusters: InferenceCandidate[][] = []
  for (const c of sorted) {
    const last = clusters[clusters.length - 1]
    if (!last) { clusters.push([c]); continue }
    const lastAnchor = Date.parse(last[last.length - 1].anchor_time)
    if (Date.parse(c.anchor_time) - lastAnchor <= window) last.push(c)
    else clusters.push([c])
  }

  return clusters.map((cluster) => {
    const ranked = cluster
      .map((c) => ({ c, priority: Number(getSourcePriority(c.source)) }))
      .sort((a, b) => b.priority - a.priority || b.c.confidence - a.c.confidence)
    const winner = ranked[0].c
    return {
      source: winner.source,
      airborne_hours: winner.airborne_hours,
      hobbs_delta: winner.hobbs_delta,
      tach_delta: winner.tach_delta,
      confidence: winner.confidence,
      alternates: ranked.map((r) => ({ source: r.c.source, confidence: r.c.confidence, priority: r.priority })),
    }
  })
}

/**
 * Side-effecting wrapper: writes meter_readings + source_overrides for
 * each winner. Caller (cron) constructs candidates from the configured
 * sources and passes them in.
 */
export async function applyInference(
  supabase: SupabaseClient,
  input: InferenceInput & {
    /** Existing aircraft.total_time_hours / current Hobbs to compute new value. */
    current_hobbs?: number | null
    /** Drives meter_definition_id resolution. NULL = skip writing meter_readings. */
    hobbs_meter_definition_id?: string | null
  },
): Promise<{ winners: InferenceWinner[]; meter_readings_written: number; overrides_logged: number }> {
  const winners = inferFromCandidates(input)
  let written = 0
  let overrides = 0

  for (const w of winners) {
    // Optional meter-readings write — only when we know which meter to update.
    if (input.hobbs_meter_definition_id && typeof input.current_hobbs === 'number' && w.hobbs_delta != null) {
      const newValue = (input.current_hobbs ?? 0) + w.hobbs_delta
      const { error } = await supabase
        .from('meter_readings')
        .insert({
          organization_id: input.organization_id,
          aircraft_id: input.aircraft_id,
          meter_definition_id: input.hobbs_meter_definition_id,
          value: newValue,
          reading_date: input.candidates.find((c) => c.source === w.source)?.anchor_time?.slice(0, 10),
          source: w.source,
          notes: `inferred from ${w.alternates.length} source${w.alternates.length === 1 ? '' : 's'}`,
        })
      if (!error) written++
    }

    // Audit-log every alternate source that lost to the winner.
    for (const alt of w.alternates) {
      if (alt.source === w.source) continue
      await recordOverride(supabase, {
        organization_id: input.organization_id,
        entity_type: 'flight_event',
        entity_id: input.aircraft_id,
        field_name: 'hobbs_delta',
        old_value: { source: alt.source, confidence: alt.confidence },
        new_value: { source: w.source, confidence: w.confidence, hobbs_delta: w.hobbs_delta },
        old_source: alt.source,
        old_priority: alt.priority,
        new_source: w.source,
        new_priority: Number(getSourcePriority(w.source)),
        notes: `Multi-source inference: ${w.source} (priority ${getSourcePriority(w.source)}) wins over ${alt.source}`,
      })
      overrides++
    }
  }
  return { winners, meter_readings_written: written, overrides_logged: overrides }
}
