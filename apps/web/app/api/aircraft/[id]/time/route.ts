import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic', 'pilot'])
const VERIFIED_SOURCES = new Set(['mechanic_verified', 'work_order_closeout', 'logbook'])

const readingSchema = z.object({
  time_type: z.enum(['tach', 'hobbs', 'total_time', 'engine_1', 'engine_2', 'prop_1', 'prop_2', 'cycles', 'landings']),
  value: z.number().min(0),
})

const timeUpdateSchema = z.object({
  observed_at: z.string().optional(),
  source: z.enum([
    'mechanic_verified',
    'owner_entered',
    'work_order_closeout',
    'logbook',
    'airbly',
    'scheduling',
    'adsb_estimate',
    'manual',
    'imported',
  ]).default('manual'),
  confidence: z.enum(['high', 'medium', 'low', 'unknown']).optional(),
  notes: z.string().max(2000).optional().nullable(),
  allow_regression_override: z.boolean().optional(),
  readings: z.array(readingSchema).min(1).optional(),
  tach: z.number().min(0).optional(),
  hobbs: z.number().min(0).optional(),
  total_time: z.number().min(0).optional(),
  cycles: z.number().int().min(0).optional(),
  landings: z.number().int().min(0).optional(),
})

function buildReadings(input: z.infer<typeof timeUpdateSchema>) {
  const explicit = input.readings ?? []
  const derived = [
    input.tach !== undefined ? { time_type: 'tach' as const, value: input.tach } : null,
    input.hobbs !== undefined ? { time_type: 'hobbs' as const, value: input.hobbs } : null,
    input.total_time !== undefined ? { time_type: 'total_time' as const, value: input.total_time } : null,
    input.cycles !== undefined ? { time_type: 'cycles' as const, value: input.cycles } : null,
    input.landings !== undefined ? { time_type: 'landings' as const, value: input.landings } : null,
  ].filter(Boolean) as Array<z.infer<typeof readingSchema>>

  return explicit.length > 0 ? explicit : derived
}

function snapshotField(timeType: string, verified: boolean) {
  const prefix = verified ? 'verified' : 'estimated'
  switch (timeType) {
    case 'tach':
      return `${prefix}_tach`
    case 'hobbs':
      return `${prefix}_hobbs`
    case 'total_time':
      return `${prefix}_total_time`
    case 'cycles':
      return `${prefix}_cycles`
    case 'landings':
      return `${prefix}_landings`
    default:
      return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = timeUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const readings = buildReadings(parsed.data)
  if (readings.length === 0) {
    return NextResponse.json({ error: 'At least one time value is required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id, tail_number')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const { data: snapshot } = await supabase
    .from('aircraft_time_snapshots')
    .select('*')
    .eq('aircraft_id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  const source = parsed.data.source
  const isVerified = VERIFIED_SOURCES.has(source)
  const confidence =
    parsed.data.confidence ??
    (source === 'adsb_estimate' ? 'low' : isVerified ? 'high' : 'medium')
  const observedAt = parsed.data.observed_at ?? new Date().toISOString()

  if (isVerified && snapshot && !parsed.data.allow_regression_override) {
    const regressions = readings.flatMap((reading) => {
      const field = snapshotField(reading.time_type, true)
      if (!field) return []
      const previous = Number((snapshot as Record<string, unknown>)[field])
      if (Number.isFinite(previous) && reading.value < previous) {
        return [`${reading.time_type} would decrease from ${previous} to ${reading.value}`]
      }
      return []
    })

    if (regressions.length > 0) {
      return NextResponse.json(
        {
          error: 'Aircraft time regression requires an override explanation.',
          regressions,
        },
        { status: 409 },
      )
    }
  }

  const insertRows = readings.map((reading) => ({
    organization_id: ctx.organizationId,
    aircraft_id: params.id,
    time_type: reading.time_type,
    value: reading.value,
    observed_at: observedAt,
    source,
    confidence,
    is_verified: isVerified,
    notes: parsed.data.notes ?? null,
    recorded_by: ctx.user.id,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('aircraft_time_entries')
    .insert(insertRows)
    .select('*')

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const patch: Record<string, unknown> = {
    aircraft_id: params.id,
    organization_id: ctx.organizationId,
    last_entry_id: inserted?.[0]?.id ?? null,
  }
  const timestampKey = isVerified ? 'verified_at' : 'estimated_at'
  const sourceKey = isVerified ? 'verified_source' : 'estimated_source'
  patch[timestampKey] = observedAt
  patch[sourceKey] = source
  if (!isVerified) patch.estimate_confidence = confidence

  for (const reading of readings) {
    const field = snapshotField(reading.time_type, isVerified)
    if (!field) continue
    patch[field] = reading.time_type === 'cycles' || reading.time_type === 'landings'
      ? Math.round(reading.value)
      : reading.value
  }

  const { data: nextSnapshot, error: snapshotError } = await supabase
    .from('aircraft_time_snapshots')
    .upsert(patch, { onConflict: 'aircraft_id' })
    .select('*')
    .single()

  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })

  const legacyTotal = isVerified
    ? patch.verified_total_time ?? patch.verified_tach
    : null
  if (legacyTotal !== null && legacyTotal !== undefined) {
    await supabase
      .from('aircraft')
      .update({ total_time_hours: legacyTotal, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('organization_id', ctx.organizationId)
  }

  await Promise.all([
    supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      user_id: ctx.user.id,
      action: 'aircraft.time_updated',
      entity_type: 'aircraft',
      entity_id: params.id,
      metadata_json: {
        tail_number: aircraft.tail_number,
        source,
        confidence,
        is_verified: isVerified,
        readings,
      },
    }),
    supabase.from('aircraft_timeline_events').insert({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      module: 'aircraft_time',
      action: 'time_updated',
      source_record_type: 'aircraft_time_entries',
      source_record_id: inserted?.[0]?.id ?? null,
      title: isVerified ? 'Verified aircraft time updated' : 'Estimated aircraft time updated',
      summary: readings.map((reading) => `${reading.time_type}: ${reading.value}`).join(', '),
      actor_id: ctx.user.id,
      metadata: { source, confidence, is_verified: isVerified },
    }),
  ]).catch(() => null)

  return NextResponse.json({
    entries: inserted ?? [],
    snapshot: nextSnapshot,
  }, { status: 201 })
}
