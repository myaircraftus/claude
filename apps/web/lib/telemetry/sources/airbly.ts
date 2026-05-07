/**
 * Airbly telemetry source (Spec 4.1 — stub layer).
 *
 *   AIRBLY_USE_MOCK=true        → mock
 *   AIRBLY_API_KEY=...          → real public Airbly API
 *   neither                     → mock (safe default)
 *
 * Public Airbly API base: https://api.airbly.com (v1). Mock returns
 * canned 1.4-hour flight events with realistic Hobbs deltas + GPS.
 *
 * Reuses the TelemetryProvider union from sprint 4.3 (types/index.ts).
 * confidence scale: 0-1, mapped to lib/source-priority.ts via tier.
 */

export interface AirblyFlight {
  /** Airbly device-side flight id. */
  id: string
  device_id: string
  start_time: string
  end_time: string
  airborne_hours: number
  hobbs_delta_hours: number | null
  /** Aircraft tail registered to the device (matched server-side). */
  tail_number?: string
  origin_icao?: string | null
  destination_icao?: string | null
  /** ADS-B-style ping path; Airbly logs its own GPS — denser when present. */
  path: Array<{ ts: string; lat: number; lon: number; alt?: number; gs?: number }>
}

export interface AirblySource {
  /** Pull flights from Airbly since `since`. Caller filters by org. */
  listFlightsSince(args: { since: string; tail_filter?: string[] }): Promise<AirblyFlight[]>
}

export function isAirblyMock(): boolean {
  if (process.env.AIRBLY_USE_MOCK === 'true') return true
  if (!process.env.AIRBLY_API_KEY) return true
  return false
}

let cached: AirblySource | null = null

export function getAirblySource(): AirblySource {
  if (cached) return cached
  cached = isAirblyMock() ? buildMock() : buildReal()
  return cached
}

function buildMock(): AirblySource {
  return {
    async listFlightsSince(args) {
      const sinceMs = Date.parse(args.since)
      const start = new Date(Math.max(sinceMs, Date.now() - 12 * 3600 * 1000))
      const end = new Date(start.getTime() + 1.4 * 3600 * 1000)
      const tail = args.tail_filter?.[0] ?? 'N12345'
      return [{
        id: `mock_flight_${Math.random().toString(36).slice(2, 10)}`,
        device_id: 'AB-MOCK-0001',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        airborne_hours: 1.4,
        hobbs_delta_hours: 1.5,
        tail_number: tail,
        origin_icao: 'KAPA',
        destination_icao: 'KASE',
        path: Array.from({ length: 12 }, (_, i) => ({
          ts: new Date(start.getTime() + i * 7 * 60 * 1000).toISOString(),
          lat: 39.5 + i * 0.05, lon: -106.0 + i * 0.06, alt: 12500, gs: 145,
        })),
      }]
    },
  }
}

function buildReal(): AirblySource {
  const base = process.env.AIRBLY_API_BASE ?? 'https://api.airbly.com/v1'
  return {
    async listFlightsSince(args) {
      const u = new URL(`${base}/flights`)
      u.searchParams.set('since', args.since)
      const res = await fetch(u.toString(), {
        headers: {
          authorization: `Bearer ${process.env.AIRBLY_API_KEY}`,
          accept: 'application/json',
        },
      })
      if (!res.ok) throw new Error(`Airbly ${res.status}`)
      const j = await res.json() as { flights: AirblyFlight[] }
      return j.flights ?? []
    },
  }
}
