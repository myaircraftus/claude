/**
 * Tach-time inference (Spec 4.3) — pure functions.
 *
 * Given an airborne window from any telemetry source (ADSB Exchange, Airbly,
 * FSP, FlightAware), compute estimated Hobbs and Tach deltas.
 *
 * Math (from Spec 4.3 §Tach inference):
 *   Hobbs = airborne_time + (tach_buffer_hours_per_cycle × cycles)
 *   Tach  = Hobbs × tach_to_hobbs_ratio
 *
 * Defaults: 0.4 hr buffer per cycle (taxi out + runup + hold + taxi in),
 * 0.85 ratio (typical piston-single at cruise RPM). Per-aircraft overrides
 * live in telemetry_sources.tach_buffer_hours_per_cycle / tach_to_hobbs_ratio
 * — operators can tune for atypical ops (ag flights with very short cycles
 * push the buffer down; turbines push the ratio toward 1.0).
 *
 * Confidence (0–1) is set per source in `confidenceForSource()` and tightened
 * by path density in `inferMeterDeltasFromFlight()`. UI badge tier:
 *   ≥0.95 → 'verified', ≥0.80 → 'synced', ≥0.55 → 'estimated', else 'logged'.
 */

import type {
  TachInferenceResult,
  TelemetryConfidenceTier,
  TelemetryProvider,
  TelemetryPing,
} from '@/types'

/* ─── Defaults from Spec 4.3 ────────────────────────────────────────────── */

export const DEFAULT_BUFFER_HOURS_PER_CYCLE = 0.4

/**
 * Aircraft-class default ratios. The DB stores a single per-aircraft
 * override on telemetry_sources.tach_to_hobbs_ratio; this map seeds it
 * when the row is created based on aircraft.make/model/operation_type.
 */
export const TACH_TO_HOBBS_RATIO_DEFAULTS: Record<string, number> = {
  'piston-single': 0.85,
  'piston-twin':   0.83,
  'turbine':       0.95,
  'jet':           0.95,
  'helicopter':    0.90,
  'default':       0.85,
}

/**
 * Heuristic: classify an aircraft for the purposes of picking a default
 * Hobbs→Tach ratio. Keeps the inference layer free of make-model regexes
 * — the DB column is the long-term home, this is just a seed.
 */
export function classifyAircraftForTach(args: {
  engine_model?: string | null
  operation_types?: string[] | null
}): keyof typeof TACH_TO_HOBBS_RATIO_DEFAULTS {
  const ops = (args.operation_types ?? []).map((s) => s.toLowerCase())
  if (ops.some((o) => o.includes('rotor') || o.includes('helicopter'))) return 'helicopter'
  if (ops.some((o) => o.includes('jet'))) return 'jet'
  if (ops.some((o) => o.includes('turbine') || o.includes('turboprop'))) return 'turbine'
  // Engine model substring check — leaves the door open for "PT6", "PW100", "TFE"
  // etc. without baking a full table here.
  const eng = (args.engine_model ?? '').toLowerCase()
  if (/pt6|pw1\d{2}|tpe|tfe|garrett|honeywell\s*tpe/.test(eng)) return 'turbine'
  if (/twin|io-540|io-720|tio-540/.test(eng)) return 'piston-twin'
  return 'piston-single'
}

/* ─── Confidence policy (Spec 4.3 table) ────────────────────────────────── */

export const CONFIDENCE_RANGE: Record<TelemetryProvider | 'manual', { min: number; max: number; tier: TelemetryConfidenceTier }> = {
  airbly:          { min: 0.95, max: 1.00, tier: 'verified' },
  fsp:             { min: 0.80, max: 0.95, tier: 'synced'   },
  'adsb-exchange': { min: 0.55, max: 0.75, tier: 'estimated' },
  flightaware:     { min: 0.55, max: 0.75, tier: 'estimated' },
  manual:          { min: 1.00, max: 1.00, tier: 'verified' },
}

export function tierForConfidence(score: number): TelemetryConfidenceTier {
  if (score >= 0.95) return 'verified'
  if (score >= 0.80) return 'synced'
  if (score >= 0.55) return 'estimated'
  return 'logged'
}

/* ─── Pure inference (used by /api/integrations/adsb/sync) ──────────────── */

export function inferMeterDeltasFromFlight(args: {
  airborne_hours: number
  cycles?: number
  /** From telemetry_sources row. Falls back to DEFAULT_BUFFER_HOURS_PER_CYCLE. */
  tach_buffer_hours_per_cycle?: number
  /** From telemetry_sources row. Falls back to 0.85 (piston-single). */
  tach_to_hobbs_ratio?: number
  /** Per-source confidence band. */
  source: TelemetryProvider | 'manual'
  /** Number of position pings the flight detector grouped — denser = more
   *  confident the airborne window we computed is real. */
  ping_count?: number
}): TachInferenceResult {
  const cycles = Math.max(1, args.cycles ?? 1)
  const buffer = args.tach_buffer_hours_per_cycle ?? DEFAULT_BUFFER_HOURS_PER_CYCLE
  const ratio = args.tach_to_hobbs_ratio ?? TACH_TO_HOBBS_RATIO_DEFAULTS.default

  const hobbs_delta = round2(Math.max(0, args.airborne_hours) + buffer * cycles)
  const tach_delta = round2(hobbs_delta * ratio)

  // Source band sets the floor + ceiling. Path density nudges within it.
  const band = CONFIDENCE_RANGE[args.source] ?? CONFIDENCE_RANGE.manual
  const density = pingDensityFactor(args.ping_count ?? 0, args.airborne_hours)
  const confidence = round2(band.min + (band.max - band.min) * density)

  return {
    hobbs_delta,
    tach_delta,
    confidence,
    tach_to_hobbs_ratio: ratio,
    buffer_hours_per_cycle: buffer,
  }
}

/**
 * 0–1 score: how much should we trust the airborne window we computed?
 * 1 ping/min for 1.4 hr = ~84 pings = high density → factor ≈ 1.
 * < 10 pings for any flight → factor ≈ 0 (likely a brief ADS-B blip).
 */
function pingDensityFactor(pingCount: number, airborneHours: number): number {
  if (airborneHours <= 0) return 0
  const expected = Math.max(1, Math.round(airborneHours * 60))
  const ratio = pingCount / expected
  if (ratio >= 0.5) return 1
  if (ratio <= 0.1) return 0
  return (ratio - 0.1) / 0.4
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/* ─── UI helpers ────────────────────────────────────────────────────────── */

/**
 * Map (source, confidence) → display label. Spec 4.3 acceptance:
 * "Estimated" badge for ADSB inferred, "Confirmed" once the owner
 * accepts/overrides.
 */
export function badgeLabel(args: {
  source: TelemetryProvider | 'manual'
  confidence: number
  confirmed: boolean
}): string {
  if (args.confirmed) return 'Confirmed'
  const tier = tierForConfidence(args.confidence)
  switch (tier) {
    case 'verified':  return 'Verified'
    case 'synced':    return 'Synced'
    case 'estimated': return 'Estimated'
    case 'logged':    return 'Logged'
  }
}

/** First ping ts → ICAO airport guess via path[].alt_first sub-1000ft AGL.
 *  Stub helper for sources that don't label origin/destination themselves. */
export function airportGuessFromPings(_pings: TelemetryPing[]): { origin: string | null; destination: string | null } {
  // Real implementation would join against an airport DB by lat/lon. v0:
  // we leave origin/destination to the source when it provides them.
  return { origin: null, destination: null }
}
