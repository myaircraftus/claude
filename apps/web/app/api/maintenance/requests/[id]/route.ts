import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const orgId = membership.organization_id
  const body = await req.json()

  if (!body.status || !['accepted', 'declined'].includes(body.status)) {
    return NextResponse.json(
      { error: 'status must be "accepted" or "declined"' },
      { status: 400 }
    )
  }

  // Fetch the maintenance request
  const { data: request, error: fetchError } = await supabase
    .from('maintenance_requests')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !request) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (request.status !== 'pending') {
    return NextResponse.json(
      { error: 'Only pending requests can be updated' },
      { status: 409 }
    )
  }

  // ── Declined ────────────────────────────────────────────────────────────────
  if (body.status === 'declined') {
    const { data, error } = await supabase
      .from('maintenance_requests')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // ── Accepted: create work order + update squawks ────────────────────────────

  // 1. Gather squawk titles for the complaint field
  let complaintText = 'Maintenance request'
  if (request.squawk_ids && request.squawk_ids.length > 0) {
    const { data: squawks } = await supabase
      .from('squawks')
      .select('id, title')
      .in('id', request.squawk_ids)

    if (squawks && squawks.length > 0) {
      complaintText = squawks.map((s: any) => s.title).join('; ')
    }
  }

  // 2. Generate work order number
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const seq = String((count ?? 0) + 1).padStart(4, '0')
  const work_order_number = `WO-${year}-${seq}`

  // 3. Create the work order
  const { data: workOrder, error: woError } = await supabase
    .from('work_orders')
    .insert({
      organization_id: orgId,
      aircraft_id: request.aircraft_id,
      work_order_number,
      status: 'draft',
      complaint: complaintText,
      assigned_mechanic_id: user.id,
    })
    .select()
    .single()

  if (woError) return NextResponse.json({ error: woError.message }, { status: 500 })

  // 4. Update linked squawks
  if (request.squawk_ids && request.squawk_ids.length > 0) {
    await supabase
      .from('squawks')
      .update({
        status: 'in_work_order',
        assigned_work_order_id: workOrder.id,
        updated_at: new Date().toISOString(),
      })
      .in('id', request.squawk_ids)
  }

  // 5. Update the maintenance request
  const { data: updated, error: updateError } = await supabase
    .from('maintenance_requests')
    .update({
      status: 'converted_to_wo',
      created_work_order_id: workOrder.id,
      responded_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    ...updated,
    work_order_id: workOrder.id,
    work_order_number: workOrder.work_order_number,
  })
}
