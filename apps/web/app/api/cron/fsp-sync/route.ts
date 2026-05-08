/**
 * GET /api/cron/fsp-sync  (Spec 4.2 stub layer)
 *
 * Vercel-cron sweep that pulls FlightSchedule Pro reservations for
 * every aircraft. Real FSP requires per-org OAuth tokens — for the
 * stub layer the mock client returns canned data without tokens. Real
 * adapter pulls tokens from a future fsp_sync_state table (logged
 * follow-up — same shape as qbo_sync_state).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getFspSource, isFspMock } from '@/lib/telemetry/sources/flight-schedule-pro'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isVercelCron(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCron(req)) return NextResponse.json({ error: 'Cron only' }, { status: 401 })

  const service = createServiceSupabase()
  const { data: aircraft } = await service.from('aircraft')
    .select('id, organization_id, tail_number')
    .eq('is_archived', false)
    .limit(50)

  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const source = getFspSource()
  const access_token = isFspMock() ? 'mock_at' : 'TODO_LOAD_FROM_FSP_SYNC_STATE'
  const results: Array<{ tail: string; flights: number }> = []

  for (const a of (aircraft ?? []) as Array<{ id: string; organization_id: string; tail_number: string }>) {
    try {
      const flights = await source.listFlightsSince({ since, access_token, tail_filter: [a.tail_number] })
      for (const f of flights) {
        const hobbs_delta = (f.hobbs_in != null && f.hobbs_out != null) ? f.hobbs_out - f.hobbs_in : null
        const tach_delta  = (f.tach_in != null && f.tach_out != null)   ? f.tach_out - f.tach_in   : null
        await service.from('flight_events').insert({
          organization_id: a.organization_id,
          aircraft_id: a.id,
          source: 'fsp',
          confidence: 0.92,
          start_time: f.start_time,
          end_time: f.end_time,
          airborne_hours: f.airborne_hours,
          inferred_hobbs_delta: hobbs_delta,
          inferred_tach_delta: tach_delta,
          path: [],
          origin_icao: f.origin_icao ?? null,
          destination_icao: f.destination_icao ?? null,
          was_overridden: false,
        })
      }
      results.push({ tail: a.tail_number, flights: flights.length })
    } catch (e) {
      console.warn('[fsp-sync]', a.tail_number, e instanceof Error ? e.message : e)
      results.push({ tail: a.tail_number, flights: 0 })
    }
  }

  return NextResponse.json({ ok: true, mock: isFspMock(), results })
}
