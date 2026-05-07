/**
 * FlightSchedule Pro telemetry source (Spec 4.2 — stub layer).
 *
 *   FSP_USE_MOCK=true                              → mock
 *   FSP_OAUTH_CLIENT_ID + FSP_OAUTH_CLIENT_SECRET  → real OAuth + API
 *   neither                                        → mock
 *
 * FSP integration is OAuth-based per their dev portal. Mock returns
 * deterministic flight reservations + completed-flight payload shapes
 * so the inference engine can dedupe against Airbly + ADSB-Exchange
 * with confidence scoring intact.
 */

export interface FspFlight {
  reservation_id: string
  /** FSP aircraft id; tail matched server-side. */
  aircraft_id: string
  tail_number?: string
  pilot_name?: string | null
  start_time: string
  end_time: string
  airborne_hours: number
  /** FSP records Hobbs in/out + Tach in/out separately. */
  hobbs_in: number | null
  hobbs_out: number | null
  tach_in: number | null
  tach_out: number | null
  origin_icao?: string | null
  destination_icao?: string | null
}

export interface FspSource {
  buildAuthorizeUrl(args: { state: string; redirect_uri: string }): string
  exchangeAuthCode(args: { code: string; redirect_uri: string }): Promise<{ access_token: string; refresh_token: string; expires_in: number }>
  listFlightsSince(args: { since: string; access_token: string; tail_filter?: string[] }): Promise<FspFlight[]>
}

export function isFspMock(): boolean {
  if (process.env.FSP_USE_MOCK === 'true') return true
  if (!process.env.FSP_OAUTH_CLIENT_ID || !process.env.FSP_OAUTH_CLIENT_SECRET) return true
  return false
}

let cached: FspSource | null = null

export function getFspSource(): FspSource {
  if (cached) return cached
  cached = isFspMock() ? buildMock() : buildReal()
  return cached
}

function buildMock(): FspSource {
  return {
    buildAuthorizeUrl(args) {
      const u = new URL(args.redirect_uri)
      u.searchParams.set('code', `fsp_mock_code_${Math.random().toString(36).slice(2, 10)}`)
      u.searchParams.set('state', args.state)
      return u.toString()
    },
    async exchangeAuthCode(_args) {
      return { access_token: `fsp_mock_at_${Math.random().toString(36).slice(2, 12)}`, refresh_token: 'fsp_mock_rt', expires_in: 3600 }
    },
    async listFlightsSince(args) {
      const sinceMs = Date.parse(args.since)
      const start = new Date(Math.max(sinceMs, Date.now() - 6 * 3600 * 1000))
      const end = new Date(start.getTime() + 1.6 * 3600 * 1000)
      const tail = args.tail_filter?.[0] ?? 'N12345'
      return [{
        reservation_id: `fsp_resv_${Math.random().toString(36).slice(2, 10)}`,
        aircraft_id: 'fsp_ac_001',
        tail_number: tail,
        pilot_name: 'Mock Pilot',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        airborne_hours: 1.6,
        hobbs_in: 4123.4, hobbs_out: 4124.9,
        tach_in: 3987.1, tach_out: 3988.4,
        origin_icao: 'KAPA',
        destination_icao: 'KCOS',
      }]
    },
  }
}

function buildReal(): FspSource {
  const base = process.env.FSP_API_BASE ?? 'https://api.flightschedulepro.com/v1'
  const oauthBase = process.env.FSP_OAUTH_BASE ?? 'https://auth.flightschedulepro.com/oauth2'
  return {
    buildAuthorizeUrl(args) {
      const u = new URL(`${oauthBase}/authorize`)
      u.searchParams.set('client_id', process.env.FSP_OAUTH_CLIENT_ID!)
      u.searchParams.set('redirect_uri', args.redirect_uri)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', 'flights.read aircraft.read')
      u.searchParams.set('state', args.state)
      return u.toString()
    },
    async exchangeAuthCode(args) {
      const res = await fetch(`${oauthBase}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code: args.code, redirect_uri: args.redirect_uri,
          client_id: process.env.FSP_OAUTH_CLIENT_ID!, client_secret: process.env.FSP_OAUTH_CLIENT_SECRET!,
        }),
      })
      if (!res.ok) throw new Error(`FSP token exchange ${res.status}`)
      return await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    },
    async listFlightsSince(args) {
      const u = new URL(`${base}/flights`)
      u.searchParams.set('since', args.since)
      const res = await fetch(u.toString(), { headers: { authorization: `Bearer ${args.access_token}` } })
      if (!res.ok) throw new Error(`FSP ${res.status}`)
      const j = await res.json() as { flights: FspFlight[] }
      return j.flights ?? []
    },
  }
}
