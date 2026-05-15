/**
 * GET / PUT /api/aircraft/[id]/operating-cost/profile
 *
 * The stored per-aircraft operating-cost parameters (aircraft_operating_costs).
 *
 * NOTE: the sibling /api/aircraft/[id]/operating-cost route is the legacy
 * computed-breakdown endpoint (Spec 7.4, consumed by EconomicsView). To
 * avoid breaking it, the new stored-profile GET/PUT live here at /profile.
 *
 * GET  → { source: 'saved' | 'ai_suggested' | 'empty', data }
 *        - saved record if one exists
 *        - else an AI suggestion (if OpenAI is configured)
 *        - else an empty object
 * PUT  → upserts the record (one row per aircraft) → { source: 'saved', data }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { createServiceSupabase } from '@/lib/supabase/server'
import { suggestOperatingCost } from '@/lib/economics/operating-cost-ai'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Numeric columns (numeric in PG — kept as float on write). */
const NUMERIC_FIELDS = [
  'fuel_burn_gph',
  'fuel_price_per_gal',
  'oil_burn_qph',
  'oil_price_per_qt',
  'engine_reserve_per_hr',
  'prop_reserve_per_hr',
  'scheduled_maint_per_hr',
  'unscheduled_maint_per_hr',
  'insurance_per_year',
  'annual_fixed_cost',
  'tiedown_per_month',
  'lease_per_month',
  'selling_rate_per_hr',
] as const

function coerceNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const x = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(x) ? x : null
}

function coerceInt(v: unknown): number | null {
  const n = coerceNum(v)
  return n === null ? null : Math.round(n)
}

async function resolveAircraft(
  supabase: Awaited<ReturnType<typeof requireAppServerSession>>['supabase'],
  orgId: string,
  aircraftId: string,
) {
  const { data } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model, year, engine_make, engine_model')
    .eq('organization_id', orgId)
    .eq('id', aircraftId)
    .maybeSingle()
  return data as
    | { id: string; tail_number: string; make: string | null; model: string | null; year: number | null; engine_make: string | null; engine_model: string | null }
    | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const aircraft = await resolveAircraft(supabase, orgId, params.id)
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  const { data: row } = await supabase
    .from('aircraft_operating_costs')
    .select('*')
    .eq('aircraft_id', params.id)
    .maybeSingle()

  if (row) {
    return NextResponse.json({ source: 'saved', data: row })
  }

  // No saved record — offer an AI estimate to pre-fill the form.
  const suggestion = await suggestOperatingCost({
    year: aircraft.year,
    make: aircraft.make,
    model: aircraft.model,
    engine: [aircraft.engine_make, aircraft.engine_model].filter(Boolean).join(' ') || null,
  })

  if (suggestion) {
    return NextResponse.json({ source: 'ai_suggested', data: suggestion })
  }
  return NextResponse.json({ source: 'empty', data: {} })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const aircraft = await resolveAircraft(supabase, orgId, params.id)
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    aircraft_id: params.id,
    organization_id: orgId,
  }
  for (const field of NUMERIC_FIELDS) {
    payload[field] = coerceNum(body[field])
  }
  payload.expected_annual_hours = coerceInt(body.expected_annual_hours)
  payload.is_leased = body.is_leased === true
  payload.rental_type = body.rental_type === 'wet' ? 'wet' : 'dry'
  payload.ai_confidence =
    typeof body.ai_confidence === 'string' ? body.ai_confidence : null
  payload.ai_notes = typeof body.ai_notes === 'string' ? body.ai_notes : null

  // Service client for the write: scoped strictly to the caller's own org +
  // a verified aircraft, so it cannot touch another tenant's data. Mirrors
  // the persona-switch route's self-service write pattern.
  const service = createServiceSupabase()
  const { data, error } = await service
    .from('aircraft_operating_costs')
    .upsert(payload, { onConflict: 'aircraft_id' })
    .select('*')
    .single()

  if (error) {
    console.error('[operating-cost/profile PUT] upsert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ source: 'saved', data })
}
