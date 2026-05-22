/**
 * GET /api/cron/telemetry-inference  (Spec 4.4 stub layer)
 *
 * Multi-source dedup + winner pick. Reads recent flight_events for
 * each aircraft (across all sources), groups by ~30-minute anchor
 * windows, picks the highest-priority source per window via
 * lib/telemetry/inference-engine.ts, audit-logs the loser sources via
 * source_overrides. Higher-priority winner overwrites the inferred
 * Hobbs/Tach used by the meter-readings denormalization step.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { applyInference, type InferenceCandidate } from '@/lib/telemetry/inference-engine'

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
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  const { data: aircraft } = await service.from('aircraft')
    .select('id, organization_id, tail_number, total_time_hours')
    .eq('is_archived', false)
    .limit(50)

  const results: Array<{ tail: string; winners: number; overrides: number }> = []

  for (const a of (aircraft ?? []) as Array<{ id: string; organization_id: string; tail_number: string; total_time_hours: number | null }>) {
    const { data: events } = await service.from('flight_events')
      .select('source, start_time, airborne_hours, inferred_hobbs_delta, inferred_tach_delta, confidence, id')
      .eq('organization_id', a.organization_id)
      .eq('aircraft_id', a.id)
      .gte('start_time', since)
      .order('start_time', { ascending: true })
      .limit(100)

    const candidates: InferenceCandidate[] = (events ?? []).map((r: { source: string; start_time: string; airborne_hours: number; inferred_hobbs_delta: number | null; inferred_tach_delta: number | null; confidence: number; id: string }) => {
      const e = r as { source: string; start_time: string; airborne_hours: number; inferred_hobbs_delta: number | null; inferred_tach_delta: number | null; confidence: number; id: string }
      return {
        source: e.source as InferenceCandidate['source'],
        anchor_time: e.start_time,
        airborne_hours: e.airborne_hours,
        hobbs_delta: e.inferred_hobbs_delta,
        tach_delta: e.inferred_tach_delta,
        confidence: e.confidence,
        raw_id: e.id,
      }
    })

    if (candidates.length === 0) {
      results.push({ tail: a.tail_number, winners: 0, overrides: 0 })
      continue
    }

    const result = await applyInference(service, {
      organization_id: a.organization_id,
      aircraft_id: a.id,
      candidates,
      current_hobbs: a.total_time_hours,
      // Skip meter-readings write at the cron level — Sprint 1.1's
      // dedicated update path is the right place. Audit-only here.
      hobbs_meter_definition_id: null,
    })

    results.push({
      tail: a.tail_number,
      winners: result.winners.length,
      overrides: result.overrides_logged,
    })
  }

  return NextResponse.json({ ok: true, swept: results.length, results })
}
