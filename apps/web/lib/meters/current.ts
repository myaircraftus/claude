/**
 * Current meter readings (Spec 1.1).
 *
 * `getCurrentMeterReading(aircraftId, meterDefinitionId)` — returns the
 * latest reading value (or null when no readings exist).
 *
 * `getCurrentMeterReadings(aircraftId)` — bulk variant: pulls every meter
 * definition on the aircraft's profile and joins to the latest reading per
 * meter. Drives AircraftMeterPanel + future logbook auto-fill.
 *
 * "Latest" = ordered by (reading_date DESC, created_at DESC). Manual edits
 * to a historical reading don't promote it to "current"; the most recent
 * physical reading wins.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MeterDefinition, MeterReading } from '@/types'

/** Single-meter lookup. Returns null if no readings exist. */
export async function getCurrentMeterReading(
  supabase: SupabaseClient,
  aircraftId: string,
  meterDefinitionId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('meter_readings')
    .select('value')
    .eq('aircraft_id', aircraftId)
    .eq('meter_definition_id', meterDefinitionId)
    .order('reading_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return Number((data as { value: number }).value)
}

export interface CurrentMeterEntry {
  definition: MeterDefinition
  current: MeterReading | null
}

/**
 * Bulk variant: for the given aircraft, return one entry per meter
 * definition on its profile (or empty array if no profile). Each entry
 * carries the most recent reading or null.
 *
 * Used by:
 *   - AircraftMeterPanel ("current values" header)
 *   - logbook entry creation auto-fill (TODO consumer)
 *   - GET /api/aircraft/[id]/meters
 */
export async function getCurrentMeterReadings(
  supabase: SupabaseClient,
  aircraftId: string,
): Promise<CurrentMeterEntry[]> {
  // 1. Resolve the aircraft's meter profile.
  const { data: ac } = await supabase
    .from('aircraft')
    .select('meter_profile_id')
    .eq('id', aircraftId)
    .maybeSingle()

  const profileId = (ac as { meter_profile_id: string | null } | null)?.meter_profile_id
  if (!profileId) return []

  // 2. Load every meter definition on the profile, in sort_order.
  const { data: defs } = await supabase
    .from('meter_definitions')
    .select('*')
    .eq('meter_profile_id', profileId)
    .order('sort_order', { ascending: true })

  const definitions = (defs ?? []) as MeterDefinition[]
  if (definitions.length === 0) return []

  // 3. Fetch the latest reading per meter. We do it in one query (all rows
  //    for this aircraft × meters) and pick the head per group in JS — for
  //    typical fleet sizes (≤ 20 aircraft, ≤ 5 meters per profile) this is
  //    cheaper than N round-trips.
  const defIds = definitions.map((d) => d.id)
  const { data: readings } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('aircraft_id', aircraftId)
    .in('meter_definition_id', defIds)
    .order('reading_date', { ascending: false })
    .order('created_at', { ascending: false })

  const latestByDef = new Map<string, MeterReading>()
  for (const r of (readings ?? []) as MeterReading[]) {
    if (!latestByDef.has(r.meter_definition_id)) {
      latestByDef.set(r.meter_definition_id, r)
    }
  }

  return definitions.map((def) => ({
    definition: def,
    current: latestByDef.get(def.id) ?? null,
  }))
}

/** Format a numeric value with the meter's configured decimal precision. */
export function formatMeterValue(value: number | null, decimalPlaces: number): string {
  if (value == null) return '—'
  return value.toFixed(Math.max(0, Math.min(4, decimalPlaces)))
}
