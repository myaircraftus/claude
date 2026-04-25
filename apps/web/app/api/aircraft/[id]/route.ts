import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { AIRCRAFT_OPERATION_TYPES } from '@/lib/aircraft/operations'
import { findOwnerCustomer, syncAircraftOwnerAssignment } from '@/lib/aircraft/ownership'
import type { OrgRole } from '@/types'

// ─── Role helpers ─────────────────────────────────────────────────────────────

const MECHANIC_AND_ABOVE: OrgRole[] = ['owner', 'admin', 'mechanic']
const OWNER_AND_ADMIN: OrgRole[] = ['owner', 'admin']

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

function formatAircraftUpdateError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}) {
  const combined = [error.message, error.details, error.hint].filter(Boolean).join(' ')

  if (error.code === '23505' && /tail_number/i.test(combined)) {
    return {
      status: 409,
      error: 'This tail number already exists in your workspace.',
    }
  }

  if (error.code === '23514' && /operation_type/i.test(combined)) {
    return {
      status: 422,
      error:
        'That operating profile could not be saved right now. Please refresh and try again. If this aircraft is already claimed in another workspace, contact support.',
      details: combined,
    }
  }

  return {
    status: 500,
    error: error.message || 'Failed to update aircraft',
    details: error.details || undefined,
  }
}

// ─── GET /api/aircraft/[id] ───────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: aircraft, error: aircraftError } = await supabase
      .from('aircraft')
      .select('*')
      .eq('id', params.id)
      .single()

    if (aircraftError || !aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
    }

    // Verify user belongs to this org
    const membership = await getMembership(supabase, user.id, aircraft.organization_id)
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [documentCountRes, ownerCustomerRes, assignmentsRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('aircraft_id', params.id),
      aircraft.owner_customer_id
        ? supabase
            .from('customers')
            .select('id, name, company, email, phone')
            .eq('organization_id', aircraft.organization_id)
            .eq('id', aircraft.owner_customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('aircraft_customer_assignments')
        .select(`
          id,
          relationship,
          is_primary,
          customer:customer_id (
            id,
            name,
            company,
            email,
            phone
          )
        `)
        .eq('organization_id', aircraft.organization_id)
        .eq('aircraft_id', params.id),
    ])

    return NextResponse.json({
      ...aircraft,
      document_count: documentCountRes.count ?? 0,
      owner_customer: ownerCustomerRes.data ?? null,
      linked_customers: assignmentsRes.data ?? [],
    })
  } catch (err) {
    console.error('[GET /api/aircraft/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── PUT /api/aircraft/[id] ───────────────────────────────────────────────────

const updateAircraftSchema = z.object({
  tail_number: z.string().min(2).max(10).transform(v => v.toUpperCase()).optional(),
  make: z.string().min(1).max(80).optional(),
  model: z.string().min(1).max(80).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 2).optional().nullable(),
  serial_number: z.string().max(50).optional().nullable(),
  engine_make: z.string().max(80).optional().nullable(),
  engine_model: z.string().max(80).optional().nullable(),
  engine_serial: z.string().max(50).optional().nullable(),
  prop_make: z.string().max(80).optional().nullable(),
  prop_model: z.string().max(80).optional().nullable(),
  prop_serial: z.string().max(50).optional().nullable(),
  avionics_notes: z.string().max(2000).optional().nullable(),
  base_airport: z.string().max(10).optional().nullable(),
  operator_name: z.string().max(120).optional().nullable(),
  operation_type: z.enum(AIRCRAFT_OPERATION_TYPES).optional().nullable(),
  operation_types: z.array(z.enum(AIRCRAFT_OPERATION_TYPES)).max(4).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  total_time_hours: z.number().min(0).optional().nullable(),
  owner_customer_id: z.string().uuid().optional().nullable(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch aircraft to get org id
    const { data: aircraft, error: fetchError } = await supabase
      .from('aircraft')
      .select('id, organization_id, tail_number, owner_customer_id')
      .eq('id', params.id)
      .single()

    if (fetchError || !aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
    }

    // Mechanic+ required
    const membership = await getMembership(supabase, user.id, aircraft.organization_id)
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!MECHANIC_AND_ABOVE.includes(membership.role as OrgRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions — mechanic role or above required' },
        { status: 403 }
      )
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = updateAircraftSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const normalizedUpdate = { ...parsed.data }
    if (Object.prototype.hasOwnProperty.call(normalizedUpdate, 'operation_type') || Object.prototype.hasOwnProperty.call(normalizedUpdate, 'operation_types')) {
      const derivedOperationType =
        normalizedUpdate.operation_type ??
        normalizedUpdate.operation_types?.[0] ??
        null
      normalizedUpdate.operation_type = derivedOperationType
      normalizedUpdate.operation_types =
        normalizedUpdate.operation_types && normalizedUpdate.operation_types.length > 0
          ? normalizedUpdate.operation_types
          : derivedOperationType
            ? [derivedOperationType]
            : []
    }

    const nextOwnerCustomerId = Object.prototype.hasOwnProperty.call(normalizedUpdate, 'owner_customer_id')
      ? normalizedUpdate.owner_customer_id ?? null
      : aircraft.owner_customer_id ?? null

    if (
      Object.prototype.hasOwnProperty.call(normalizedUpdate, 'owner_customer_id') &&
      nextOwnerCustomerId
    ) {
      const ownerCustomer = await findOwnerCustomer(supabase, aircraft.organization_id, nextOwnerCustomerId)
      if (!ownerCustomer) {
        return NextResponse.json({ error: 'Owner customer not found' }, { status: 404 })
      }
    }

    if (normalizedUpdate.tail_number && normalizedUpdate.tail_number !== aircraft.tail_number) {
      const { data: duplicateAircraft } = await supabase
        .from('aircraft')
        .select('id')
        .eq('organization_id', aircraft.organization_id)
        .eq('tail_number', normalizedUpdate.tail_number)
        .neq('id', params.id)
        .maybeSingle()

      if (duplicateAircraft) {
        return NextResponse.json(
          { error: `Aircraft ${normalizedUpdate.tail_number} already exists in your organization` },
          { status: 409 }
        )
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('aircraft')
      .update({ ...normalizedUpdate, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (updateError || !updated) {
      console.error('[PUT /api/aircraft/[id]] update error', updateError)
      const formatted = formatAircraftUpdateError(updateError ?? {})
      return NextResponse.json(
        {
          error: formatted.error,
          details: formatted.details,
          code: updateError?.code ?? null,
        },
        { status: formatted.status }
      )
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdate, 'owner_customer_id')) {
      const { error: ownerAssignmentError } = await syncAircraftOwnerAssignment({
        supabase,
        organizationId: aircraft.organization_id,
        aircraftId: params.id,
        ownerCustomerId: nextOwnerCustomerId,
      })

      if (ownerAssignmentError) {
        console.error('[PUT /api/aircraft/[id]] owner assignment sync error', ownerAssignmentError)
        return NextResponse.json(
          { error: 'Aircraft was updated, but owner assignment could not be synchronized' },
          { status: 500 }
        )
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: aircraft.organization_id,
      user_id: user.id,
      action: 'aircraft.updated',
      entity_type: 'aircraft',
      entity_id: params.id,
      metadata_json: normalizedUpdate,
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[PUT /api/aircraft/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE /api/aircraft/[id] ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch aircraft
    const { data: aircraft, error: fetchError } = await supabase
      .from('aircraft')
      .select('id, organization_id, tail_number, is_archived')
      .eq('id', params.id)
      .single()

    if (fetchError || !aircraft) {
      return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
    }

    if (aircraft.is_archived) {
      return NextResponse.json({ error: 'Aircraft is already archived' }, { status: 409 })
    }

    // Owner/admin only for delete
    const membership = await getMembership(supabase, user.id, aircraft.organization_id)
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!OWNER_AND_ADMIN.includes(membership.role as OrgRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions — owner or admin required to archive aircraft' },
        { status: 403 }
      )
    }

    // Soft-delete: set is_archived = true
    const { error: archiveError } = await supabase
      .from('aircraft')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (archiveError) {
      console.error('[DELETE /api/aircraft/[id]] archive error', archiveError)
      return NextResponse.json({ error: 'Failed to archive aircraft' }, { status: 500 })
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      organization_id: aircraft.organization_id,
      user_id: user.id,
      action: 'aircraft.archived',
      entity_type: 'aircraft',
      entity_id: params.id,
      metadata_json: { tail_number: aircraft.tail_number },
    })

    return NextResponse.json({ success: true, archived: true })
  } catch (err) {
    console.error('[DELETE /api/aircraft/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
