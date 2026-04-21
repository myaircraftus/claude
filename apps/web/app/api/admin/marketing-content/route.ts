import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { CONTENT_TYPES, MARKETING_PAGES } from '@/lib/marketing/content'

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

/** GET: list all content (public read \u2014 no auth required). */
export async function GET(req: NextRequest) {
  const service = createServiceSupabase()
  const { searchParams } = new URL(req.url)
  const page = searchParams.get('page')

  let query = service
    .from('marketing_content')
    .select('id, page, slot, content_type, value, metadata, updated_at, updated_by')
    .order('page', { ascending: true })
    .order('slot', { ascending: true })

  if (page) query = query.eq('page', page)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with updater info
  const userIds = Array.from(
    new Set((data ?? []).map((r: any) => r.updated_by).filter(Boolean))
  ) as string[]
  let updaters: Record<string, { full_name?: string; email?: string }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of (profiles ?? []) as any[]) {
      updaters[p.id] = { full_name: p.full_name, email: p.email }
    }
  }

  const enriched = (data ?? []).map((r: any) => ({
    ...r,
    updated_by_profile: r.updated_by ? updaters[r.updated_by] ?? null : null,
  }))

  return NextResponse.json({ content: enriched })
}

/** POST: upsert a single content entry (admin only). */
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const page = String(body?.page ?? '').trim()
  const slot = String(body?.slot ?? '').trim()
  const contentType = String(body?.content_type ?? '').trim()
  const value = body?.value == null ? null : String(body.value)
  const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {}

  if (!page || !slot) {
    return NextResponse.json({ error: 'page and slot are required' }, { status: 400 })
  }
  if (!MARKETING_PAGES.includes(page as any)) {
    return NextResponse.json({ error: `Unknown page "${page}"` }, { status: 400 })
  }
  if (!CONTENT_TYPES.includes(contentType as any)) {
    return NextResponse.json({ error: `Unknown content_type "${contentType}"` }, { status: 400 })
  }
  if (contentType === 'json' && value) {
    try {
      JSON.parse(value)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON value' }, { status: 400 })
    }
  }
  if (contentType === 'number' && value && Number.isNaN(Number(value))) {
    return NextResponse.json({ error: 'Invalid numeric value' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('marketing_content')
    .upsert(
      {
        page,
        slot,
        content_type: contentType,
        value,
        metadata,
        updated_by: guard.user!.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'page,slot' }
    )
    .select('id, page, slot, content_type, value, metadata, updated_at, updated_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data })
}
