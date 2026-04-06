// GET /api/parts/library/[id] — single library part with computed sell_price
// PATCH /api/parts/library/[id] — update fields (markup, price, etc.)
// DELETE /api/parts/library/[id] — remove from library

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

function computeSellPrice(part: {
  base_price: number | null
  markup_mode: string | null
  markup_percent: number | null
  custom_rate: number | null
}): { sell_price: number | null; markup_amount: number | null } {
  const base = part.base_price
  if (base == null) return { sell_price: null, markup_amount: null }

  switch (part.markup_mode) {
    case 'percent': {
      const pct = part.markup_percent ?? 0
      const markup = base * (pct / 100)
      return { sell_price: Math.round((base + markup) * 100) / 100, markup_amount: Math.round(markup * 100) / 100 }
    }
    case 'custom_rate': {
      const rate = part.custom_rate ?? base
      return { sell_price: Math.round(rate * 100) / 100, markup_amount: Math.round((rate - base) * 100) / 100 }
    }
    default:
      return { sell_price: base, markup_amount: 0 }
  }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const { data: part, error } = await (supabase as any)
    .from('parts_library')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (error || !part) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pricing = computeSellPrice(part)
  return NextResponse.json({ ...part, ...pricing })
}

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
  const allowedFields = [
    'part_number', 'title', 'description', 'image_url', 'category',
    'preferred_vendor', 'vendor_url', 'base_price', 'currency',
    'markup_mode', 'markup_percent', 'custom_rate', 'condition',
  ]

  const patch: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      patch[field] = body[field]
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: updated, error } = await (supabase as any)
    .from('parts_library')
    .update(patch)
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pricing = computeSellPrice(updated)
  return NextResponse.json({ ...updated, ...pricing })
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
    .from('parts_library')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
