import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()

  if (!body.aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const validRelationships = ['owner', 'operator', 'lessee', 'manager', 'fractional']
  const relationship = body.relationship ?? 'owner'
  if (!validRelationships.includes(relationship)) {
    return NextResponse.json({ error: 'Invalid relationship type' }, { status: 400 })
  }

  const { data: aircraft, error: aircraftError } = await supabase
    .from('aircraft')
    .select('id, organization_id, tail_number, owner_customer_id')
    .eq('organization_id', orgId)
    .eq('id', body.aircraft_id)
    .maybeSingle()

  if (aircraftError || !aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  const wantsPrimaryOwner = relationship === 'owner' || Boolean(body.is_primary)

  if (
    wantsPrimaryOwner &&
    aircraft.owner_customer_id &&
    aircraft.owner_customer_id !== params.id &&
    body.transfer !== true
  ) {
    const { data: currentCustomer } = await supabase
      .from('customers')
      .select('id, name, company, email')
      .eq('organization_id', orgId)
      .eq('id', aircraft.owner_customer_id)
      .maybeSingle()

    return NextResponse.json(
      {
        error: `Aircraft ${aircraft.tail_number} is already assigned to ${currentCustomer?.name ?? 'another customer'}. Transfer it instead of creating a duplicate assignment.`,
        code: 'AIRCRAFT_ALREADY_ASSIGNED',
        current_customer: currentCustomer ?? null,
        can_transfer: true,
      },
      { status: 409 }
    )
  }

  const { data: existingAssignment } = await supabase
    .from('aircraft_customer_assignments')
    .select('id')
    .eq('organization_id', orgId)
    .eq('aircraft_id', body.aircraft_id)
    .eq('customer_id', params.id)
    .maybeSingle()

  if (wantsPrimaryOwner && aircraft.owner_customer_id && aircraft.owner_customer_id !== params.id) {
    const { error: clearPreviousOwnerError } = await supabase
      .from('aircraft_customer_assignments')
      .delete()
      .eq('organization_id', orgId)
      .eq('aircraft_id', body.aircraft_id)
      .eq('customer_id', aircraft.owner_customer_id)
      .eq('relationship', 'owner')

    if (clearPreviousOwnerError) {
      return NextResponse.json({ error: clearPreviousOwnerError.message }, { status: 500 })
    }
  }

  let data
  let error
  const responseStatus = existingAssignment?.id ? 200 : 201

  if (existingAssignment?.id) {
    const response = await supabase
      .from('aircraft_customer_assignments')
      .update({
        relationship,
        is_primary: wantsPrimaryOwner,
      })
      .eq('id', existingAssignment.id)
      .select(`
        id, aircraft_id, customer_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .single()

    data = response.data
    error = response.error
  } else {
    const response = await supabase
      .from('aircraft_customer_assignments')
      .insert({
        organization_id: orgId,
        aircraft_id: body.aircraft_id,
        customer_id: params.id,
        relationship,
        is_primary: wantsPrimaryOwner,
      })
      .select(`
        id, aircraft_id, customer_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number, make, model)
      `)
      .single()

    data = response.data
    error = response.error
  }

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Aircraft is already assigned to this customer' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (wantsPrimaryOwner) {
    const { error: ownerUpdateError } = await supabase
      .from('aircraft')
      .update({
        owner_customer_id: params.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.aircraft_id)
      .eq('organization_id', orgId)

    if (ownerUpdateError) {
      return NextResponse.json({ error: ownerUpdateError.message }, { status: 500 })
    }
  }

  return NextResponse.json(data, { status: responseStatus })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const body = await req.json()

  if (!body.aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, owner_customer_id')
    .eq('organization_id', orgId)
    .eq('id', body.aircraft_id)
    .maybeSingle()

  const { error } = await supabase
    .from('aircraft_customer_assignments')
    .delete()
    .eq('organization_id', orgId)
    .eq('aircraft_id', body.aircraft_id)
    .eq('customer_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (aircraft?.owner_customer_id === params.id) {
    const { error: ownerClearError } = await supabase
      .from('aircraft')
      .update({
        owner_customer_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .eq('id', body.aircraft_id)

    if (ownerClearError) {
      return NextResponse.json({ error: ownerClearError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
