/**
 * Engine + prop overhaul reserves (Spec 7.4).
 *
 * "Reserves" are the per-hour set-aside owners should be saving for the
 * inevitable engine + prop overhauls. Default Lycoming/Continental TBO
 * is 2,000 engine hours; default overhaul cost is $30K (mid-spread for
 * a 4-cyl normally aspirated engine in 2026). Default prop overhaul is
 * $5K every 1,500 hours (constant-speed prop, light single).
 *
 * The aircraft schema does NOT yet carry per-aircraft overhaul cost
 * estimates or TBO overrides — both are spec follow-ups. For now this
 * module reads from `aircraft.engine_tbo_hours` IF the column exists
 * (it is part of the v_aircraft_computed_status view per migration 023
 * but NOT a column on aircraft itself), otherwise falls back to the
 * defaults below. Operator can record an explicit `engine_overhaul_reserve`
 * cost_entry per hour to override the calculation entirely.
 */

export interface ReserveDefaults {
  engineOverhaulCostUsd: number
  engineTboHours: number
  propOverhaulCostUsd: number
  propTboHours: number
}

/** Industry defaults used when per-aircraft overrides aren't available. */
export const RESERVE_DEFAULTS: ReserveDefaults = {
  engineOverhaulCostUsd: 30_000,
  engineTboHours: 2_000,
  propOverhaulCostUsd: 5_000,
  propTboHours: 1_500,
}

export interface ReserveOverrides {
  /** Per-aircraft engine overhaul cost override. */
  engineOverhaulCostUsd?: number | null
  /** Per-aircraft TBO override (hours). */
  engineTboHours?: number | null
  propOverhaulCostUsd?: number | null
  propTboHours?: number | null
}

/**
 * Per-hour engine reserve. Falls back to defaults when no overrides are
 * supplied. Returns an object with the per-hour amount + the inputs used,
 * so the UI can show "$15/hr (defaults: $30,000 / 2,000 hours)".
 */
export function computeEngineReserve(overrides: ReserveOverrides = {}) {
  const cost = overrides.engineOverhaulCostUsd ?? RESERVE_DEFAULTS.engineOverhaulCostUsd
  const tbo = overrides.engineTboHours ?? RESERVE_DEFAULTS.engineTboHours
  const perHour = tbo > 0 ? cost / tbo : 0
  return {
    perHour,
    overhaulCostUsd: cost,
    tboHours: tbo,
    isDefault: overrides.engineOverhaulCostUsd == null && overrides.engineTboHours == null,
  }
}

/**
 * Per-hour prop overhaul reserve. Same shape as the engine reserve.
 */
export function computePropReserve(overrides: ReserveOverrides = {}) {
  const cost = overrides.propOverhaulCostUsd ?? RESERVE_DEFAULTS.propOverhaulCostUsd
  const tbo = overrides.propTboHours ?? RESERVE_DEFAULTS.propTboHours
  const perHour = tbo > 0 ? cost / tbo : 0
  return {
    perHour,
    overhaulCostUsd: cost,
    tboHours: tbo,
    isDefault: overrides.propOverhaulCostUsd == null && overrides.propTboHours == null,
  }
}
