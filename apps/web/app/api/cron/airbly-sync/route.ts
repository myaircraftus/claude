/**
 * GET /api/cron/airbly-sync  (Spec 4.1 stub layer)
 *
 * Vercel-cron sweep that pulls Airbly flights for every aircraft with a
 * registered device. Mock returns 1 canned flight per call so the
 * inference engine has data to dedupe + score against ADSB-Exchange.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getAirblySource, isAirblyMock } from '@/lib/telemetry/sources/airbly'

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
    .is('deleted_at', null)
    .limit(50)

  const since = new Date(Date.now() - 6 * 3600_000).toISOString()
  const source = getAirblySource()
  const results: Array<{ tail: string; flights: number }> = []

  for (const a of (aircraft ?? []) as Array<{ id: string; organization_id: string; tail_number: string }>) {
    try {
      const flights = await source.listFlightsSince({ since, tail_filter: [a.tail_number] })
      // Persist as flight_events with source='airbly'.
      for (const f of flights) {
        await service.from('flight_events').insert({
          organization_id: a.organization_id,
          aircraft_id: a.id,
          source: 'airbly',
          confidence: 0.95,
          start_time: f.start_time,
          end_time: f.end_time,
          airborne_hours: f.airborne_hours,
          inferred_hobbs_delta: f.hobbs_delta_hours,
          path: f.path,
          origin_icao: f.origin_icao ?? null,
          destination_icao: f.destination_icao ?? null,
          was_overridden: false,
        })
      }
      results.push({ tail: a.tail_number, flights: flights.length })
    } catch (e) {
      console.warn('[airbly-sync]', a.tail_number, e instanceof Error ? e.message : e)
      results.push({ tail: a.tail_number, flights: 0 })
    }
  }

  return NextResponse.json({ ok: true, mock: isAirblyMock(), results })
}
