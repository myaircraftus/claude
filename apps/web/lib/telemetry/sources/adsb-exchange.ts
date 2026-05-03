/**
 * ADSB Exchange client (Spec 4.3) — server-only.
 *
 * NEVER import this from a client component. The RAPIDAPI key lives in
 * process.env.RAPIDAPI_ADSB_EXCHANGE_KEY and must never reach the browser.
 *
 * RapidAPI surface: https://rapidapi.com/adsbx/api/adsbexchange-com1
 * Two endpoints we use:
 *   - GET /v2/icao/{hex}   — last known position (cheap, fan-in OK)
 *   - GET /v2/registration/{tail} — by tail number (one-shot lookup)
 *
 * Historical track endpoints exist but are paid-tier only. For v0 we poll
 * "last known position" on a cadence and let flightDetector group the
 * resulting ping stream into flights. Real-time the cadence is set by
 * the cron tick (Spec 4.4 wires the schedule).
 */

import type { TelemetryPing } from '@/types'

/** Public surface of the client — narrow on purpose. */
export interface AdsbExchangeClient {
  /** Look up an aircraft's last position by ICAO24 hex code. */
  getLastPositionByIcao(hex: string): Promise<TelemetryPing | null>
  /** Look up an aircraft by FAA tail number; returns ICAO24 hex + last ping. */
  resolveByTail(tailNumber: string): Promise<{ icao24: string | null; ping: TelemetryPing | null }>
}

const RAPIDAPI_HOST = 'adsbexchange-com1.p.rapidapi.com'
const BASE = `https://${RAPIDAPI_HOST}`

class HttpAdsbExchangeClient implements AdsbExchangeClient {
  constructor(private readonly key: string) {}

  async getLastPositionByIcao(hex: string): Promise<TelemetryPing | null> {
    const cleanHex = hex.trim().toLowerCase().replace(/^0x/, '')
    if (!/^[0-9a-f]{6}$/.test(cleanHex)) {
      throw new Error('icao24 must be 6 hex chars')
    }
    const json = await this.fetch(`/v2/icao/${cleanHex}/`)
    return parseFirstAircraftPing(json)
  }

  async resolveByTail(tailNumber: string): Promise<{ icao24: string | null; ping: TelemetryPing | null }> {
    const tail = tailNumber.trim().toUpperCase()
    if (!tail) return { icao24: null, ping: null }
    const json = await this.fetch(`/v2/registration/${encodeURIComponent(tail)}/`)
    const ping = parseFirstAircraftPing(json)
    const icao24 = parseFirstAircraftHex(json)
    return { icao24, ping }
  }

  private async fetch(path: string): Promise<unknown> {
    const url = `${BASE}${path}`
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': this.key,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        accept: 'application/json',
      },
      // Short timeout — this runs in a cron route. Cap latency so a single
      // stalled aircraft doesn't block a fleet sync.
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`adsb-exchange ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json()
  }
}

/** Parse the first aircraft entry from a v2 response into a TelemetryPing. */
function parseFirstAircraftPing(payload: unknown): TelemetryPing | null {
  const ac = pickFirstAircraft(payload)
  if (!ac) return null
  const lat = numericOrNull(ac.lat)
  const lon = numericOrNull(ac.lon)
  if (lat == null || lon == null) return null
  // ADSB Exchange returns seenPos (seconds ago) instead of an absolute ts.
  // Anchor against now() at fetch time.
  const seenAgoSec = numericOrNull(ac.seen_pos ?? ac.seenPos) ?? 0
  const ts = new Date(Date.now() - seenAgoSec * 1000).toISOString()
  return {
    ts,
    lat,
    lon,
    alt: numericOrNull(ac.alt_baro ?? ac.altitude ?? ac.alt) ?? null,
    gs: numericOrNull(ac.gs ?? ac.spd) ?? null,
  }
}

function parseFirstAircraftHex(payload: unknown): string | null {
  const ac = pickFirstAircraft(payload)
  if (!ac) return null
  const hex = typeof ac.hex === 'string' ? ac.hex : null
  return hex ? hex.toLowerCase() : null
}

function pickFirstAircraft(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const ac = (payload as { ac?: unknown }).ac
  if (!Array.isArray(ac) || ac.length === 0) return null
  const first = ac[0]
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
}

function numericOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/* ─── Factory ──────────────────────────────────────────────────────────── */

/**
 * Construct the client from the env. Throws if the key is missing — do not
 * silently no-op, because that would mask a misconfigured deploy.
 *
 * The fake variant is used by tests + the dev-mode "demo flight" workflow
 * so we never hit RapidAPI from local dev unless explicitly opted in.
 */
export function getAdsbExchangeClient(): AdsbExchangeClient {
  const key = process.env.RAPIDAPI_ADSB_EXCHANGE_KEY
  if (!key) {
    throw new Error(
      'RAPIDAPI_ADSB_EXCHANGE_KEY is not set — server-only env var, never reaches client'
    )
  }
  return new HttpAdsbExchangeClient(key)
}

/** Synthetic client for tests / local demos. */
export function createFakeAdsbExchangeClient(pings: TelemetryPing[]): AdsbExchangeClient {
  return {
    async getLastPositionByIcao() {
      return pings[pings.length - 1] ?? null
    },
    async resolveByTail() {
      return { icao24: 'a1b2c3', ping: pings[pings.length - 1] ?? null }
    },
  }
}
