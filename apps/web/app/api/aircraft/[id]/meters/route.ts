/**
 * /api/aircraft/[id]/meters (Spec 1.1)
 *
 * GET → returns the aircraft's meter profile, every meter definition on
 *       that profile, the latest reading per meter, and the recent
 *       reading history (default 50 rows). Drives AircraftMeterPanel
 *       in one round-trip.
 *
 * PATCH → assign / unassign a meter profile to the aircraft (mechanic+).
 *         Body: { meter_profile_id: string | null }.
 *         The dedicated route exists (vs. piggy-backing on
 *         /api/aircraft/[id] PATCH) to avoid coupling Sprint 1.1 to the
 *         existing huge aircraft-edit surface.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentMeterReadings } from '@/lib/meters/current'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import type { OrgRole, MeterReading } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, meter_profile_id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const profileId = (aircraft as { meter_profile_id: string | null }).meter_profile_id

  const [{ data: profile }, current] = await Promise.all([
    profileId
      ? supabase
          .from('meter_profiles')
          .select(`
            id, organization_id, name, description, is_template, created_at, updated_at,
            meters:meter_definitions ( id, meter_profile_id, name, unit, decimal_places, sort_order, created_at, updated_at )
          `)
          .eq('id', profileId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getCurrentMeterReadings(supabase, params.id),
  ])

  // Recent history — last 50 readings across all meters on this aircraft.
  const limitRaw = parseInt(req.nextUrl.searchParams.get('history_limit') ?? '50', 10)
  const limit    = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 500)

  const { data: history } = await supabase
    .from('meter_readings')
    .select('*')
    .eq('aircraft_id', params.id)
    .eq('organization_id', ctx.organizationId)
    .order('reading_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({
    aircraft,
    profile: profile
      ? {
          ...(profile as any),
          meters: Array.isArray((profile as any).meters)
            ? [...(profile as any).meters].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            : [],
        }
      : null,
    current,
    history: (history ?? []) as MeterReading[],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: { meter_profile_id?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!('meter_profile_id' in body)) {
    return NextResponse.json({ error: 'meter_profile_id required (or null to unassign)' }, { status: 400 })
  }

  const supabase = createServerSupabase()

  // If assigning, verify the profile is in the same org (RLS would also
  // block, but a clean 400 is friendlier).
  if (body.meter_profile_id) {
    const { data: prof } = await supabase
      .from('meter_profiles')
      .select('id')
      .eq('id', body.meter_profile_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
    if (!prof) {
      return NextResponse.json(
        { error: 'meter_profile_id does not exist in this organization' },
        { status: 400 },
      )
    }
  }

  const { data, error } = await supabase
    .from('aircraft')
    .update({ meter_profile_id: body.meter_profile_id ?? null })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('id, meter_profile_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  return NextResponse.json({ ok: true, aircraft: data })
}
