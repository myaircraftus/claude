// GET /api/labor-rates — list labor rate cards for org
// POST /api/labor-rates — create rate card

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const customerId = searchParams.get('customer_id')
  const mechanicUserId = searchParams.get('mechanic_user_id')

  let q: any = (supabase as any)
    .from('labor_rate_cards')
    .select('*')
    .eq('organization_id', membership.organization_id)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })

  if (customerId) q = q.eq('customer_id', customerId)
  if (mechanicUserId) q = q.eq('mechanic_user_id', mechanicUserId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rates: data ?? [] })
}

export async function POST(req: NextRequest) {
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
  if (!body.name || body.default_hourly_rate == null) {
    return NextResponse.json({ error: 'name and default_hourly_rate are required' }, { status: 400 })
  }

  const record = {
    organization_id: membership.organization_id,
    name: body.name,
    default_hourly_rate: Number(body.default_hourly_rate),
    customer_id: body.customer_id ?? null,
    mechanic_user_id: body.mechanic_user_id ?? null,
    is_default: body.is_default ?? false,
  }

  // If this is set as default, unset other defaults for the org
  if (record.is_default) {
    await (supabase as any)
      .from('labor_rate_cards')
      .update({ is_default: false })
      .eq('organization_id', membership.organization_id)
      .eq('is_default', true)
  }

  const { data: created, error } = await (supabase as any)
    .from('labor_rate_cards')
    .insert(record)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(created, { status: 201 })
}
