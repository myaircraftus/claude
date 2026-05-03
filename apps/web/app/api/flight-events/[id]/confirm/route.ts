/**
 * POST /api/flight-events/[id]/confirm  (Spec 4.3)
 *
 * Owner accepts (or overrides) an ADSB-inferred flight. Per spec acceptance:
 * "Owner taps Confirm or types the actual Hobbs to override. Confirming
 * flips the badge to Confirmed."
 *
 * Body: { hobbs_delta?: number, tach_delta?: number, notes?: string }
 *   - If hobbs_delta or tach_delta provided AND differs from inferred,
 *     was_overridden=true and source flips to 'manual', confidence to 1.0.
 *   - If body is empty, the inferred values stand and we just stamp
 *     confirmed_at + confirmed_by.
 *
 * Cross-wire: any meter_readings rows for this flight (source_flight_event_id)
 * are also stamped with the user-confirmed value if overridden, AND their
 * source/confidence are updated to mirror the flight_event.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { FlightEvent } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  // Owner / mechanic / admin / pilot can all confirm — pilot is the spec's
  // intended user for "I just landed; confirm my Hobbs."
  if (!['owner', 'admin', 'mechanic', 'pilot'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { data: flightRaw } = await supabase
    .from('flight_events')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .single()
  if (!flightRaw) return NextResponse.json({ error: 'Flight not found' }, { status: 404 })
  const flight = flightRaw as FlightEvent

  if (flight.confirmed_at) {
    return NextResponse.json({ flight, already_confirmed: true })
  }

  let body: { hobbs_delta?: number; tach_delta?: number; notes?: string } = {}
  try { body = (await req.json()) as typeof body } catch { /* empty body OK */ }

  const overrideHobbs = numberOrNull(body.hobbs_delta)
  const overrideTach = numberOrNull(body.tach_delta)

  const wasOverridden =
    (overrideHobbs != null && overrideHobbs !== flight.inferred_hobbs_delta) ||
    (overrideTach != null && overrideTach !== flight.inferred_tach_delta)

  const finalHobbs = overrideHobbs ?? flight.inferred_hobbs_delta ?? null
  const finalTach = overrideTach ?? flight.inferred_tach_delta ?? null

  const patch: Record<string, unknown> = {
    confirmed_at: new Date().toISOString(),
    confirmed_by: user.id,
    was_overridden: wasOverridden,
    inferred_hobbs_delta: finalHobbs,
    inferred_tach_delta: finalTach,
    updated_at: new Date().toISOString(),
  }
  if (wasOverridden) {
    // Per spec: confirmed/overridden flips to "Confirmed" → source becomes
    // 'manual' and confidence 1.0 because the user is now the source of truth.
    patch.source = 'manual'
    patch.confidence = 1.0
  } else {
    // Confirmation without override keeps the inferred values but caps
    // confidence to 1.0 — the user vouched for them.
    patch.confidence = 1.0
  }
  if (typeof body.notes === 'string') patch.notes = body.notes

  const { data: updated, error: updErr } = await supabase
    .from('flight_events')
    .update(patch)
    .eq('id', flight.id)
    .eq('organization_id', membership.organization_id)
    .select('*')
    .single()
  if (updErr || !updated) {
    console.error('[flight-events confirm] update error:', updErr?.message)
    return NextResponse.json({ error: updErr?.message ?? 'update failed' }, { status: 500 })
  }

  // Mirror onto associated meter_readings rows (service client — confidence
  // CHECK is permissive and the row is org-scoped to the same RLS).
  const service = createServiceSupabase()
  await service
    .from('meter_readings')
    .update({
      source: wasOverridden ? 'manual' : 'adsb-exchange',
      confidence: 1.0,
      notes: wasOverridden
        ? 'Confirmed (overridden) by owner from ADSB Exchange flight detection'
        : 'Confirmed by owner from ADSB Exchange flight detection',
    })
    .eq('source_flight_event_id', flight.id)

  // If the user supplied an explicit override, replace the meter_readings
  // row's value too — recompute baseline + new delta. We only do this when
  // the override is provided; otherwise the original inferred value already
  // matches finalHobbs/finalTach.
  if (wasOverridden) {
    await rebaseMeterReadings(service, {
      flightEventId: flight.id,
      hobbsDelta: finalHobbs,
      tachDelta: finalTach,
    })
  }

  return NextResponse.json({ flight: updated, was_overridden: wasOverridden })
}

function numberOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.round(v * 100) / 100
}

async function rebaseMeterReadings(
  service: ReturnType<typeof createServiceSupabase>,
  args: { flightEventId: string; hobbsDelta: number | null; tachDelta: number | null },
): Promise<void> {
  // Pull the meter_readings rows that came from this flight, alongside the
  // immediately preceding reading per (aircraft, meter) so we can recompute
  // value = previous + new_delta.
  const { data: rows } = await service
    .from('meter_readings')
    .select('id, aircraft_id, meter_definition_id, reading_date, created_at, value')
    .eq('source_flight_event_id', args.flightEventId)
  if (!rows) return

  for (const r of rows as Array<{ id: string; aircraft_id: string; meter_definition_id: string; reading_date: string; created_at: string; value: number }>) {
    // Find the previous reading (older than this row's created_at).
    const { data: prev } = await service
      .from('meter_readings')
      .select('value')
      .eq('aircraft_id', r.aircraft_id)
      .eq('meter_definition_id', r.meter_definition_id)
      .lt('created_at', r.created_at)
      .order('reading_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const baseline = (prev as { value: number } | null)?.value
    if (baseline == null) continue

    const { data: defRow } = await service
      .from('meter_definitions')
      .select('name')
      .eq('id', r.meter_definition_id)
      .single()
    const name = ((defRow as { name?: string } | null)?.name ?? '').toLowerCase()
    const delta =
      name.startsWith('hobbs') ? args.hobbsDelta :
      name.startsWith('tach')  ? args.tachDelta  : null
    if (delta == null) continue

    const next = Math.round((baseline + delta) * 100) / 100
    await service.from('meter_readings').update({ value: next }).eq('id', r.id)
  }
}
