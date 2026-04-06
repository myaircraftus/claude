import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
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

  // Fetch customer with aircraft assignments
  const { data: customer, error } = await supabase
    .from('customers')
    .select(`
      id, name, company, email, phone, secondary_email, secondary_phone,
      billing_address, notes, preferred_contact, tags, portal_access,
      imported_at, import_source, created_at, updated_at,
      aircraft_customer_assignments (
        id, aircraft_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number, make, model)
      )
    `)
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (error || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }

  // Fetch recent work orders for this customer
  const { data: workOrders } = await supabase
    .from('work_orders')
    .select(`
      id, work_order_number, status, customer_complaint, total, opened_at, created_at,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', membership.organization_id)
    .eq('customer_id', params.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch invoice count (work orders in invoiced/paid status for this customer)
  const { count: invoiceCount } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', membership.organization_id)
    .eq('customer_id', params.id)
    .in('status', ['invoiced', 'paid'])

  return NextResponse.json({
    customer,
    work_orders: workOrders ?? [],
    invoice_count: invoiceCount ?? 0,
  })
}

export async function PATCH(
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

  // Only allow updating specific fields
  const allowedFields = [
    'name', 'company', 'email', 'phone', 'secondary_email', 'secondary_phone',
    'billing_address', 'notes', 'preferred_contact', 'tags', 'portal_access',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  return NextResponse.json(data)
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
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Only owner/admin can delete customers
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Only owner or admin can delete customers' }, { status: 403 })
  }

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
