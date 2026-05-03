/**
 * POST /api/integrations/adsb/sync  (Spec 4.3)
 *
 * Cron + manual sync entrypoint for the ADSB Exchange fallback.
 *
 * Modes:
 *   - cron: caller is the Vercel Cron worker (X-Vercel-Cron header). Sweeps
 *           every enabled telemetry_sources row with source='adsb-exchange'
 *           that's due for sync (last_synced_at NULL or older than the tick
 *           window).
 *   - manual: authenticated mechanic+ from the aircraft Sync tab. Body has
 *             { aircraft_id }; only that aircraft is synced.
 *
 * For each aircraft:
 *   1. Read telemetry_sources row → ICAO24 hex code from config.
 *   2. Pull last position via adsb-exchange client.
 *   3. Append the ping to the aircraft's recent ping window (we keep ~24h
 *      in telemetry_sources.config.recent_pings as a JSONB array).
 *   4. Run flightDetector over the window. New flights since last_synced_at
 *      become flight_events rows.
 *   5. For each new flight, write a confidence-scored MeterReading delta
 *      against the aircraft's Hobbs + Tach meter definitions if a meter
 *      profile is assigned.
 *   6. Emit AISignal('flight-detected') so Phase 5 ActionCards can surface.
 *
 * NEVER logs the RapidAPI key. The key is only read inside the client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getAdsbExchangeClient } from '@/lib/telemetry/sources/adsb-exchange'
import { detectFlights } from '@/lib/telemetry/flightDetector'
import {
  inferMeterDeltasFromFlight,
  classifyAircraftForTach,
  TACH_TO_HOBBS_RATIO_DEFAULTS,
} from '@/lib/telemetry/inference'
import type {
  Aircraft,
  FlightEvent,
  TelemetryPing,
  TelemetrySourceConfig,
} from '@/types'

export const dynamic = 'force-dynamic'
// Defaults to nodejs runtime — the AbortSignal.timeout + crypto path benefit.

const RECENT_PINGS_WINDOW_HOURS = 24
const RECENT_PINGS_MAX = 2000

interface SyncResult {
  aircraft_id: string
  tail: string
  pings_added: number
  flights_detected: number
  flights_new: number
  meter_readings_written: number
  error?: string
}

/* ─── Entrypoint ─────────────────────────────────────────────────────────── */

/**
 * Vercel Cron fires GET requests with User-Agent: "vercel-cron/1.0".
 * We accept both:
 *   GET  → cron-only path (rejects non-cron User-Agents)
 *   POST → manual sync from the UI (mechanic+ auth required)
 *
 * Defense-in-depth: when CRON_SECRET is set, also accept Authorization:
 * Bearer <secret>. That's the recommended Vercel pattern for protecting
 * cron endpoints from public-internet hits.
 */
function isVercelCronRequest(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCronRequest(req)) {
    return NextResponse.json(
      { error: 'GET is reserved for Vercel Cron. Use POST for manual sync.' },
      { status: 405 }
    )
  }
  return handleCron()
}

export async function POST(req: NextRequest) {
  const isCron = isVercelCronRequest(req)

  if (isCron) {
    return handleCron()
  }

  // Manual: authenticated mechanic+ from the UI.
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: { aircraft_id?: string } = {}
  try { body = (await req.json()) as { aircraft_id?: string } } catch { /* ok */ }
  if (!body.aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id required for manual sync' }, { status: 400 })
  }

  const result = await syncOneAircraftByOrg(membership.organization_id, body.aircraft_id)
  return NextResponse.json({ result })
}

/* ─── Cron sweep ─────────────────────────────────────────────────────────── */

async function handleCron(): Promise<NextResponse> {
  const service = createServiceSupabase()
  // Pull all enabled adsb-exchange sources due for sync. Cap to 50 per tick
  // so a fleet of hundreds doesn't fan out into one timeout.
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: rows, error } = await service
    .from('telemetry_sources')
    .select('id, organization_id, aircraft_id')
    .eq('source', 'adsb-exchange')
    .eq('enabled', true)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: SyncResult[] = []
  for (const row of rows ?? []) {
    try {
      results.push(await syncOneAircraftByOrg(row.organization_id, row.aircraft_id))
    } catch (e: unknown) {
      results.push({
        aircraft_id: row.aircraft_id,
        tail: '',
        pings_added: 0,
        flights_detected: 0,
        flights_new: 0,
        meter_readings_written: 0,
        error: errMessage(e),
      })
    }
  }
  return NextResponse.json({ swept: results.length, results })
}

/* ─── Per-aircraft sync ──────────────────────────────────────────────────── */

async function syncOneAircraftByOrg(orgId: string, aircraftId: string): Promise<SyncResult> {
  const service = createServiceSupabase()

  const { data: aircraftRow } = await service
    .from('aircraft')
    .select('id, organization_id, tail_number, engine_model, operation_types, meter_profile_id')
    .eq('id', aircraftId)
    .eq('organization_id', orgId)
    .single()

  if (!aircraftRow) throw new Error('aircraft not found')
  const aircraft = aircraftRow as Pick<Aircraft, 'id' | 'organization_id' | 'tail_number' | 'engine_model' | 'operation_types' | 'meter_profile_id'>

  // Fetch the telemetry_sources row OR auto-provision one if missing. Owners
  // who add an aircraft without explicitly enabling ADSB still get coverage —
  // Spec 4.3: "We *automatically* track the aircraft by tail number."
  const source = await ensureAdsbSource(orgId, aircraft)

  // 1. Pull current position.
  const client = getAdsbExchangeClient()
  let ping: TelemetryPing | null = null
  let icao24 = (source.config?.icao24 as string | undefined) ?? null

  if (!icao24) {
    const resolved = await client.resolveByTail(aircraft.tail_number)
    icao24 = resolved.icao24
    ping = resolved.ping
    if (icao24) {
      await service
        .from('telemetry_sources')
        .update({ config: { ...(source.config ?? {}), icao24 } })
        .eq('id', source.id)
    }
  } else {
    ping = await client.getLastPositionByIcao(icao24)
  }

  // 2. Append to recent_pings buffer + prune.
  const prior = (source.config?.recent_pings as TelemetryPing[] | undefined) ?? []
  const merged = ping ? appendPing(prior, ping) : prior
  const cutoffIso = new Date(Date.now() - RECENT_PINGS_WINDOW_HOURS * 3600 * 1000).toISOString()
  const window = merged.filter((p) => p.ts >= cutoffIso).slice(-RECENT_PINGS_MAX)

  await service
    .from('telemetry_sources')
    .update({
      last_synced_at: new Date().toISOString(),
      config: { ...(source.config ?? {}), icao24, recent_pings: window },
    })
    .eq('id', source.id)

  // 3. Detect flights inside the window.
  const flights = detectFlights(window)

  // 4. Insert any flight whose start_time isn't already in flight_events for
  //    this aircraft (±5 min dedupe, narrower than Spec 4.4's cross-source
  //    ±10 min — this is just same-source idempotency).
  const { data: existing } = await service
    .from('flight_events')
    .select('id, start_time')
    .eq('aircraft_id', aircraft.id)
    .gte('start_time', cutoffIso)

  const seen = new Set<number>()
  for (const r of (existing ?? []) as Array<{ start_time: string }>) {
    seen.add(quantizeTs(r.start_time, 5))
  }

  const aircraftClass = classifyAircraftForTach({
    engine_model: aircraft.engine_model ?? null,
    operation_types: aircraft.operation_types ?? null,
  })
  const ratio = source.tach_to_hobbs_ratio ?? TACH_TO_HOBBS_RATIO_DEFAULTS[aircraftClass]
  const buffer = source.tach_buffer_hours_per_cycle ?? 0.4

  let newCount = 0
  let meterReadingsWritten = 0
  for (const f of flights) {
    if (seen.has(quantizeTs(f.start_ts, 5))) continue

    const inference = inferMeterDeltasFromFlight({
      airborne_hours: f.airborne_hours,
      cycles: 1,
      tach_buffer_hours_per_cycle: buffer,
      tach_to_hobbs_ratio: ratio,
      source: 'adsb-exchange',
      ping_count: f.pings.length,
    })

    const { data: inserted, error: insErr } = await service
      .from('flight_events')
      .insert({
        organization_id: orgId,
        aircraft_id: aircraft.id,
        source: 'adsb-exchange',
        confidence: inference.confidence,
        start_time: f.start_ts,
        end_time: f.end_ts,
        airborne_hours: f.airborne_hours,
        inferred_hobbs_delta: inference.hobbs_delta,
        inferred_tach_delta: inference.tach_delta,
        path: f.pings,
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      console.error('[adsb sync] flight insert error:', insErr?.message)
      continue
    }
    newCount++

    // 5. Confidence-scored MeterReading deltas — only if the aircraft has
    //    an active meter profile. We write current_value = previous_value +
    //    delta. If we can't read a previous value, we skip (manual entry
    //    is the safer default than fabricating an absolute reading).
    if (aircraft.meter_profile_id) {
      meterReadingsWritten += await writeMeterDeltas(service, {
        organizationId: orgId,
        aircraftId: aircraft.id,
        meterProfileId: aircraft.meter_profile_id,
        flightEventId: (inserted as { id: string }).id,
        readingDate: f.end_ts.slice(0, 10),
        confidence: inference.confidence,
        hobbsDelta: inference.hobbs_delta,
        tachDelta: inference.tach_delta,
      })
    }

    // 6. AISignal — Phase 5 ActionCards consume.
    await service.from('ai_signals').insert({
      organization_id: orgId,
      signal_type: 'flight-detected',
      payload: {
        aircraft_id: aircraft.id,
        tail_number: aircraft.tail_number,
        flight_event_id: (inserted as { id: string }).id,
        airborne_hours: f.airborne_hours,
        inferred_hobbs_delta: inference.hobbs_delta,
        confidence: inference.confidence,
        source: 'adsb-exchange',
      },
      source: 'integration',
    })
  }

  return {
    aircraft_id: aircraft.id,
    tail: aircraft.tail_number,
    pings_added: ping ? 1 : 0,
    flights_detected: flights.length,
    flights_new: newCount,
    meter_readings_written: meterReadingsWritten,
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

async function ensureAdsbSource(orgId: string, aircraft: Pick<Aircraft, 'id' | 'engine_model' | 'operation_types'>): Promise<TelemetrySourceConfig> {
  const service = createServiceSupabase()
  const { data: existing } = await service
    .from('telemetry_sources')
    .select('*')
    .eq('aircraft_id', aircraft.id)
    .eq('source', 'adsb-exchange')
    .maybeSingle()

  if (existing) return existing as TelemetrySourceConfig

  const aircraftClass = classifyAircraftForTach({
    engine_model: aircraft.engine_model ?? null,
    operation_types: aircraft.operation_types ?? null,
  })
  const ratio = TACH_TO_HOBBS_RATIO_DEFAULTS[aircraftClass]

  const { data: created, error } = await service
    .from('telemetry_sources')
    .insert({
      organization_id: orgId,
      aircraft_id: aircraft.id,
      source: 'adsb-exchange',
      enabled: true,
      priority: 30,
      tach_to_hobbs_ratio: ratio,
    })
    .select('*')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'failed to provision telemetry_sources')
  return created as TelemetrySourceConfig
}

function appendPing(prior: TelemetryPing[], next: TelemetryPing): TelemetryPing[] {
  // Skip duplicate ts. Newest at the end.
  if (prior.length > 0 && prior[prior.length - 1].ts === next.ts) return prior
  return [...prior, next]
}

function quantizeTs(iso: string, minutes: number): number {
  const ms = Date.parse(iso)
  const stepMs = minutes * 60 * 1000
  return Math.round(ms / stepMs)
}

async function writeMeterDeltas(
  service: ReturnType<typeof createServiceSupabase>,
  args: {
    organizationId: string
    aircraftId: string
    meterProfileId: string
    flightEventId: string
    readingDate: string
    confidence: number
    hobbsDelta: number
    tachDelta: number
  },
): Promise<number> {
  // Pull the meter definitions on this profile + their current values.
  const { data: defs } = await service
    .from('meter_definitions')
    .select('id, name, unit')
    .eq('meter_profile_id', args.meterProfileId)
  if (!defs || defs.length === 0) return 0

  const findByName = (name: RegExp) =>
    defs.find((d: { name: string; unit: string }) => name.test(d.name.toLowerCase()))

  const hobbs = findByName(/^hobbs/)
  const tach = findByName(/^tach/)
  const targets: Array<{ id: string; delta: number }> = []
  if (hobbs && args.hobbsDelta > 0) targets.push({ id: hobbs.id, delta: args.hobbsDelta })
  if (tach && args.tachDelta > 0)   targets.push({ id: tach.id,  delta: args.tachDelta })
  if (targets.length === 0) return 0

  let written = 0
  for (const t of targets) {
    // Find the most recent value for this (aircraft, meter).
    const { data: last } = await service
      .from('meter_readings')
      .select('value')
      .eq('aircraft_id', args.aircraftId)
      .eq('meter_definition_id', t.id)
      .order('reading_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const baseline = (last as { value: number } | null)?.value ?? null
    if (baseline == null) {
      // No baseline = no fabricated absolute. Skip; owner enters first
      // reading manually then future inferred deltas accumulate.
      continue
    }
    const nextValue = round2(baseline + t.delta)
    const { error } = await service.from('meter_readings').insert({
      organization_id: args.organizationId,
      aircraft_id: args.aircraftId,
      meter_definition_id: t.id,
      value: nextValue,
      reading_date: args.readingDate,
      source: 'adsb-exchange',
      confidence: args.confidence,
      source_flight_event_id: args.flightEventId,
      notes: 'Estimated from ADSB Exchange flight detection',
    })
    if (!error) written++
    else console.error('[adsb sync] meter_readings insert error:', error.message)
  }
  return written
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
