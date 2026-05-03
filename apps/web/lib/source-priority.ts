/**
 * Source priority framework (Spec 7.8).
 *
 * Generalizes the 4.3 confidence-scoring pattern (FlightEvent.source +
 * .confidence) into a system-wide schema:
 *
 *   official  (5) — government / OEM document; unimpeachable
 *   uploaded  (4) — operator uploaded a receipt / invoice / cert
 *   connected (3) — vendor integration synced (Airbly, FSP, QBO)
 *   tracked   (2) — telemetry inferred (ADSB, GPS)
 *   estimated (1) — heuristic / default / model-projected
 *
 * Higher number wins. New data with priority > existing replaces it +
 * writes a `source_overrides` audit row. New data with priority <=
 * existing is logged as an alternate source but does NOT replace.
 *
 * The numeric scale is intentional: same column type (integer 1-5) used
 * everywhere, same comparison operator. Add a new tier (e.g. peer-reviewed
 * scientific = 6) by adding to the map; never reuse numbers.
 */

export const SOURCE_PRIORITY = {
  official:  5,
  uploaded:  4,
  connected: 3,
  tracked:   2,
  estimated: 1,
} as const

export type SourceTier = keyof typeof SOURCE_PRIORITY
export type SourcePriority = (typeof SOURCE_PRIORITY)[SourceTier]

/**
 * Map every concrete source string we use across the app to a tier.
 *
 * Sprint 4.3 (telemetry):
 *   manual = uploaded     · airbly/fsp = connected · adsb-exchange/flightaware = tracked
 *
 * Sprint 7.1 (cost_entries):
 *   manual = uploaded(4) · extracted = uploaded(4 if auto-approved else 3)
 *   imported = connected(3) · estimated = estimated(1) · reconciled = official(5)
 *
 * Sprint 1.1 (meter_readings):
 *   manual = uploaded · automatic = connected · imported = connected
 *   airbly/fsp = connected · adsb-exchange/flightaware = tracked
 *
 * Unknown source → estimated(1) so we never accidentally promote an
 * unmapped source over a real one.
 */
const SOURCE_TIER: Record<string, SourceTier> = {
  // Cost-entries (Sprint 7.1)
  reconciled:      'official',
  manual:          'uploaded',
  extracted:       'uploaded',
  imported:        'connected',
  estimated:       'estimated',

  // Telemetry (Sprint 4.3)
  airbly:          'connected',
  fsp:             'connected',
  'adsb-exchange': 'tracked',
  flightaware:     'tracked',

  // Meter-reading (Sprint 1.1) — distinct strings; map to the same tiers
  automatic:       'connected',
}

export function getSourceTier(source: string | null | undefined): SourceTier {
  if (!source) return 'estimated'
  return SOURCE_TIER[source.toLowerCase()] ?? 'estimated'
}

export function getSourcePriority(source: string | null | undefined): SourcePriority {
  return SOURCE_PRIORITY[getSourceTier(source)]
}

/**
 * Decision helper: should the new value (with priority B) replace the
 * existing value (with priority A)?
 *
 *   shouldOverride(B, A) === true  ↔  B > A
 *
 * Equal-priority means "alternate source" — caller logs but does NOT
 * overwrite. This is the pattern: keep the first manual entry, don't
 * let a later receipt replace an earlier receipt without an explicit
 * operator action.
 */
export function shouldOverride(
  newPriority: SourcePriority | number,
  existingPriority: SourcePriority | number,
): boolean {
  return Number(newPriority) > Number(existingPriority)
}

/** UI badge tier — collapses 5 priorities into 3 user-facing labels. */
export type SourceBadgeTier = 'verified' | 'synced' | 'estimated'

export function getSourceBadge(source: string | null | undefined): SourceBadgeTier {
  const tier = getSourceTier(source)
  if (tier === 'official' || tier === 'uploaded') return 'verified'
  if (tier === 'connected') return 'synced'
  return 'estimated'
}
