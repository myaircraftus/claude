import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { AIRCRAFT_OPERATION_TYPES } from '@/lib/aircraft/operations'
import type { OrgRole } from '@/types'

// ─── Role helpers ─────────────────────────────────────────────────────────────

const MECHANIC_AND_ABOVE: OrgRole[] = ['owner', 'admin', 'mechanic']

async function getMembership(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  orgId: string
) {
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .not('accepted_at', 'is', null)
    .single()

  if (error || !data) return null
  return data
}

// ─── GET /api/aircraft ────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's org
    const { data: membership, error: membershipError } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const orgId = membership.organization_id

    // Fetch aircraft with document counts
    const { data: aircraft, error: aircraftError } = await supabase
      .from('aircraft')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })

    if (aircraftError) {
      console.error('[GET /api/aircraft] query error', aircraftError)
      return NextResponse.json({ error: 'Failed to fetch aircraft' }, { status: 500 })
    }

    // Fetch document counts per aircraft in one query
    const { data: docCounts } = await supabase
      .from('documents')
      .select('aircraft_id')
      .eq('organization_id', orgId)
      .not('aircraft_id', 'is', null)

    const countMap: Record<string, number> = {}
    for (const doc of docCounts ?? []) {
      if (doc.aircraft_id) {
        countMap[doc.aircraft_id] = (countMap[doc.aircraft_id] ?? 0) + 1
      }
    }

    const result = (aircraft ?? []).map(ac => ({
      ...ac,
      document_count: countMap[ac.id] ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err) {
    console.error('[GET /api/aircraft] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/aircraft ───────────────────────────────────────────────────────

const createAircraftSchema = z.object({
  organization_id: z.string().uuid(),
  tail_number: z.string().min(2).max(10).transform(v => v.toUpperCase()),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
  serial_number: z.string().max(50).optional(),
  engine_make: z.string().max(80).optional(),
  engine_model: z.string().max(80).optional(),
  base_airport: z.string().max(10).optional(),
  operator_name: z.string().max(120).optional(),
  operation_types: z.array(z.enum(AIRCRAFT_OPERATION_TYPES)).max(4).optional(),
  notes: z.string().max(2000).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = createAircraftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { organization_id, ...fields } = parsed.data

    // Validate org membership (mechanic+ required)
    const membership = await getMembership(supabase, user.id, organization_id)
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 })
    }
    if (!MECHANIC_AND_ABOVE.includes(membership.role as OrgRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions — mechanic role or above required' },
        { status: 403 }
      )
    }

    // Check for duplicate tail number in same org
    const { data: dupCheck } = await supabase
      .from('aircraft')
      .select('id')
      .eq('organization_id', organization_id)
      .eq('tail_number', fields.tail_number)
      .eq('is_archived', false)
      .maybeSingle()

    if (dupCheck) {
      return NextResponse.json(
        { error: `Aircraft ${fields.tail_number} already exists in your organization` },
        { status: 409 }
      )
    }

    const { data: aircraft, error: insertError } = await supabase
      .from('aircraft')
      .insert({
        organization_id,
        ...fields,
        is_archived: false,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError || !aircraft) {
      console.error('[POST /api/aircraft] insert error', insertError)
      return NextResponse.json({ error: 'Failed to create aircraft' }, { status: 500 })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id,
      actor_user_id: user.id,
      action: 'aircraft.created',
      target_type: 'aircraft',
      target_id: aircraft.id,
      metadata: { tail_number: fields.tail_number, make: fields.make, model: fields.model },
    })

    return NextResponse.json(aircraft, { status: 201 })
  } catch (err) {
    console.error('[POST /api/aircraft] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
