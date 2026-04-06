import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()

  if (!body.aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const validRelationships = ['owner', 'operator', 'lessee', 'manager', 'fractional']
  const relationship = body.relationship ?? 'owner'
  if (!validRelationships.includes(relationship)) {
    return NextResponse.json({ error: 'Invalid relationship type' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('aircraft_customer_assignments')
    .insert({
      organization_id: membership.organization_id,
      aircraft_id: body.aircraft_id,
      customer_id: params.id,
      relationship,
      is_primary: body.is_primary ?? false,
    })
    .select(`
      id, aircraft_id, customer_id, relationship, is_primary,
      aircraft:aircraft_id (id, tail_number, make, model)
    `)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Aircraft is already assigned to this customer' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()

  if (!body.aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('aircraft_customer_assignments')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('aircraft_id', body.aircraft_id)
    .eq('customer_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
