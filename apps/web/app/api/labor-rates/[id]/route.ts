// PATCH /api/labor-rates/[id] — update rate card
// DELETE /api/labor-rates/[id] — delete rate card

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

  const body = await req.json()
  const allowedFields = ['name', 'default_hourly_rate', 'customer_id', 'mechanic_user_id', 'is_default']

  const patch: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      patch[field] = body[field]
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // If setting as default, unset other defaults first
  if (patch.is_default === true) {
    await (supabase as any)
      .from('labor_rate_cards')
      .update({ is_default: false })
      .eq('organization_id', membership.organization_id)
      .eq('is_default', true)
  }

  const { data: updated, error } = await (supabase as any)
    .from('labor_rate_cards')
    .update(patch)
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const { error } = await (supabase as any)
    .from('labor_rate_cards')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
