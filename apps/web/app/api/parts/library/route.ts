// GET /api/parts/library — list parts from library with search/filter/sort
// POST /api/parts/library — add part to library (auto-dedup by org + part_number + vendor)

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
  const search = searchParams.get('search') ?? ''
  const category = searchParams.get('category') ?? ''
  const sort = searchParams.get('sort') ?? 'usage'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let q: any = (supabase as any)
    .from('parts_library')
    .select('*')
    .eq('organization_id', membership.organization_id)

  if (search) {
    q = q.or(
      `part_number.ilike.%${search}%,title.ilike.%${search}%,preferred_vendor.ilike.%${search}%`
    )
  }

  if (category) {
    q = q.eq('category', category)
  }

  if (sort === 'recent') {
    q = q.order('last_ordered_at', { ascending: false, nullsFirst: false })
  } else if (sort === 'alpha') {
    q = q.order('title', { ascending: true })
  } else {
    // default: usage
    q = q.order('usage_count', { ascending: false })
  }

  q = q.range(offset, offset + limit - 1)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ parts: data ?? [] })
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
  if (!body.part_number || !body.title) {
    return NextResponse.json({ error: 'part_number and title are required' }, { status: 400 })
  }

  const record = {
    organization_id: membership.organization_id,
    part_number: body.part_number,
    title: body.title,
    description: body.description ?? null,
    image_url: body.image_url ?? null,
    category: body.category ?? 'General',
    preferred_vendor: body.preferred_vendor ?? null,
    vendor_url: body.vendor_url ?? null,
    base_price: body.base_price != null ? Number(body.base_price) : null,
    currency: body.currency ?? 'USD',
    markup_mode: body.markup_mode ?? 'none',
    markup_percent: body.markup_percent != null ? Number(body.markup_percent) : null,
    custom_rate: body.custom_rate != null ? Number(body.custom_rate) : null,
    condition: body.condition ?? null,
    created_by: user.id,
    usage_count: body.usage_count ?? 0,
    last_ordered_at: body.last_ordered_at ?? null,
  }

  // Auto-dedup: check if org + part_number + vendor already exists
  let existingQuery: any = (supabase as any)
    .from('parts_library')
    .select('id')
    .eq('organization_id', membership.organization_id)
    .eq('part_number', body.part_number)

  if (body.preferred_vendor) {
    existingQuery = existingQuery.eq('preferred_vendor', body.preferred_vendor)
  } else {
    existingQuery = existingQuery.is('preferred_vendor', null)
  }

  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    // Update existing instead of creating duplicate
    const { data: updated, error: updateErr } = await (supabase as any)
      .from('parts_library')
      .update({
        title: record.title,
        description: record.description,
        image_url: record.image_url,
        category: record.category,
        vendor_url: record.vendor_url,
        base_price: record.base_price,
        currency: record.currency,
        markup_mode: record.markup_mode,
        markup_percent: record.markup_percent,
        custom_rate: record.custom_rate,
        condition: record.condition,
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    return NextResponse.json(updated)
  }

  const { data: created, error: insertErr } = await (supabase as any)
    .from('parts_library')
    .insert(record)
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json(created, { status: 201 })
}
