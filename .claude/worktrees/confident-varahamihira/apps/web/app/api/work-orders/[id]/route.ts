import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// GET /api/work-orders/[id] — full detail with lines
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: wo, error } = await supabase
    .from('work_orders')
    .select(`
      *,
      aircraft:aircraft_id(id, tail_number, make, model, year),
      mechanic:assigned_mechanic_id(id, email, user_profiles(full_name)),
      lines:work_order_lines(*)
    `)
    .eq('id', params.id)
    .single()

  if (error || !wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Normalize DB column names to component-expected names
  const normalized = {
    ...wo,
    complaint: (wo as any).customer_complaint,
    total_amount: (wo as any).total,
    customer_visible_notes: (wo as any).customer_notes,
  }
  return NextResponse.json(normalized)
}

// PATCH /api/work-orders/[id] — update fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>

  // Timestamps for status transitions
  if (body.status === 'closed' && !body.closed_at) body.closed_at = new Date().toISOString()
  // Map component field names to actual DB column names
  if ('complaint' in body) { body.customer_complaint = body.complaint; delete body.complaint }
  if ('total_amount' in body) { body.total = body.total_amount; delete body.total_amount }
  if ('customer_visible_notes' in body) { body.customer_notes = body.customer_visible_notes; delete body.customer_visible_notes }
  // Remove non-existent columns
  delete body.invoiced_at

  const { data, error } = await supabase
    .from('work_orders')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, status, work_order_number')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
