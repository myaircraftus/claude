/**
 * /api/meter-readings (Spec 1.1)
 *
 * GET → list readings filtered by ?aircraft_id= and optionally
 *        ?meter_definition_id=. Newest first. Default limit 100.
 * POST → log a reading (mechanic+ + pilot — pilots log post-flight).
 *        Body: { aircraft_id, meter_definition_id, value, reading_date, source?, notes? }
 *
 * Cross-wire (Sprint 0c → 1.1): on successful insert, emit a 'meter-reading'
 * AISignal so the orchestrator can produce ActionCards. This closes the
 * Sprint 0c follow-up that flagged "wire emitSignal('meter-reading') from
 * the actual meter-reading endpoint" and makes the Spec 0.3 acceptance
 * criterion live with real data instead of synthetic harness signals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { emitSignal } from '@/lib/ai/signals'
import { recomputeCompliance } from '@/lib/compliance/recompute'
import type { OrgRole, MeterReadingSource } from '@/types'

const VALID_SOURCES: ReadonlySet<MeterReadingSource> = new Set([
  'manual', 'automatic', 'imported',
])

const READING_WRITE_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic', 'pilot'] as const

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const aircraftId = url.searchParams.get('aircraft_id') ?? undefined
  const meterDefId = url.searchParams.get('meter_definition_id') ?? undefined
  const limitRaw   = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit      = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500)

  const supabase = createServerSupabase()
  let q = supabase
    .from('meter_readings')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('reading_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (aircraftId) q = q.eq('aircraft_id', aircraftId)
  if (meterDefId) q = q.eq('meter_definition_id', meterDefId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ readings: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!READING_WRITE_ROLES.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const aircraftId = String(body?.aircraft_id ?? '').trim()
  const meterDefId = String(body?.meter_definition_id ?? '').trim()
  const value      = Number(body?.value)
  const readingDate = String(body?.reading_date ?? '').trim()

  if (!aircraftId)  return NextResponse.json({ error: 'aircraft_id required' },  { status: 400 })
  if (!meterDefId)  return NextResponse.json({ error: 'meter_definition_id required' }, { status: 400 })
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: 'value must be a non-negative number' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(readingDate)) {
    return NextResponse.json({ error: 'reading_date must be ISO date (YYYY-MM-DD)' }, { status: 400 })
  }

  const source: MeterReadingSource =
    body.source && VALID_SOURCES.has(body.source) ? body.source : 'manual'

  const supabase = createServerSupabase()

  // Sanity-check that the aircraft belongs to the active org. RLS would
  // reject a write to another org's aircraft anyway, but a clean 400 is
  // friendlier than an opaque RLS denial.
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('id', aircraftId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found in this organization' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('meter_readings')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: aircraftId,
      meter_definition_id: meterDefId,
      value,
      reading_date: readingDate,
      source,
      notes: body?.notes ?? null,
      recorded_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sprint 0c → 1.1 cross-wire: fire a meter-reading signal so the orchestrator
  // can produce ActionCards. Best-effort — failures here do NOT roll back
  // the reading (the user's primary action succeeded).
  emitSignal(supabase, ctx.organizationId, ctx.user.id, {
    type: 'meter-reading',
    payload: {
      aircraft_id: aircraftId,
      tail_number: (aircraft as { tail_number: string }).tail_number,
      meter_definition_id: meterDefId,
      value,
      reading_date: readingDate,
      source,
    },
    source: 'user',
  }).catch((e) => console.warn('[meter-readings] signal emit failed:', e))

  // Sprint 1.1 → 1.2 cross-wire: a new meter reading can flip compliance
  // items to overdue/due-soon. Recompute synchronously so the inserted
  // reading's downstream effect is visible to the next /api/aircraft/[id]/
  // compliance fetch. recomputeCompliance() emits its own compliance-due
  // signals on status flips → the orchestrator can produce ActionCards
  // and the notification system can fire alerts. Best-effort — failures
  // do not roll back the reading.
  recomputeCompliance(supabase, aircraftId, { userId: ctx.user.id })
    .catch((e) => console.warn('[meter-readings] compliance recompute failed:', e))

  return NextResponse.json({ reading: data }, { status: 201 })
}
