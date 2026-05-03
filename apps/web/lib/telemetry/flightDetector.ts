/**
 * Flight detector (Spec 4.3) — group raw position pings into discrete flights.
 *
 * ADSB Exchange returns a stream of position pings per ICAO24 hex code.
 * Pings come whenever the aircraft is airborne and visible to a ground
 * receiver. Gaps in coverage (rural areas, low altitude) introduce holes.
 *
 * Strategy:
 *   1. Sort pings by ts.
 *   2. Walk the list; start a new "flight" when the gap to the previous
 *      ping exceeds GAP_THRESHOLD_MIN.
 *   3. Drop sub-MIN_FLIGHT_DURATION_MIN flights as ground noise / brief
 *      hops (ramp-checks, taxi tests).
 *   4. Return airborne_hours per flight.
 *
 * Pure function. No I/O. The caller (API route) hits the DB.
 */

import type { TelemetryPing } from '@/types'

/** A gap longer than this between consecutive pings closes the flight. */
const GAP_THRESHOLD_MIN = 30
/** Flights shorter than this are dropped as noise. */
const MIN_FLIGHT_DURATION_MIN = 6
/** Minimum pings for a window to count as a flight (anti-jitter). */
const MIN_PINGS_FOR_FLIGHT = 5

export interface DetectedFlight {
  start_ts: string
  end_ts: string
  airborne_hours: number
  pings: TelemetryPing[]
}

export function detectFlights(input: TelemetryPing[]): DetectedFlight[] {
  if (!Array.isArray(input) || input.length === 0) return []

  const sorted = [...input]
    .filter((p) => p && typeof p.ts === 'string')
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))

  if (sorted.length === 0) return []

  const flights: DetectedFlight[] = []
  let bucket: TelemetryPing[] = [sorted[0]]
  let prevMs = Date.parse(sorted[0].ts)

  const closeBucket = () => {
    if (bucket.length < MIN_PINGS_FOR_FLIGHT) return
    const start = bucket[0].ts
    const end = bucket[bucket.length - 1].ts
    const ms = Date.parse(end) - Date.parse(start)
    const minutes = ms / 60000
    if (minutes < MIN_FLIGHT_DURATION_MIN) return
    flights.push({
      start_ts: start,
      end_ts: end,
      airborne_hours: round2(minutes / 60),
      pings: bucket,
    })
  }

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i]
    const ms = Date.parse(p.ts)
    const gapMin = (ms - prevMs) / 60000
    if (gapMin > GAP_THRESHOLD_MIN) {
      closeBucket()
      bucket = [p]
    } else {
      bucket.push(p)
    }
    prevMs = ms
  }
  closeBucket()

  return flights
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
