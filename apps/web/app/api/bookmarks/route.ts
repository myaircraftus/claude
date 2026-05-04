/**
 * /api/bookmarks  (Spec 6.6)
 *
 *   GET  → caller's bookmarks for the active org, ordered by position
 *   POST → upsert by (user_id, organization_id, entity_type, entity_id)
 *   DELETE ?entity_type=&entity_id= → remove the matching star
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PostBody {
  entity_type?: string
  entity_id?: string
  label?: string
  url?: string
  position?: number
}

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data, error } = await supabase
    .from('bookmarks').select('*')
    .eq('user_id', user.id).eq('organization_id', caller.organization_id)
    .order('position', { ascending: true }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookmarks: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })

  let body: PostBody
  try { body = (await req.json()) as PostBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.entity_type || !body.entity_id || !body.label || !body.url) {
    return NextResponse.json({ error: 'entity_type, entity_id, label, url required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('bookmarks')
    .upsert({
      user_id: user.id,
      organization_id: caller.organization_id,
      entity_type: body.entity_type.slice(0, 64),
      entity_id: body.entity_id.slice(0, 128),
      label: body.label.slice(0, 200),
      url: body.url.slice(0, 500),
      position: typeof body.position === 'number' ? body.position : 0,
    }, { onConflict: 'user_id,organization_id,entity_type,entity_id' })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookmark: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: caller } = await supabase
    .from('organization_memberships').select('organization_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!caller) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const url = new URL(req.url)
  const entity_type = url.searchParams.get('entity_type')
  const entity_id = url.searchParams.get('entity_id')
  if (!entity_type || !entity_id) return NextResponse.json({ error: 'entity_type + entity_id required' }, { status: 400 })

  const { error } = await supabase
    .from('bookmarks').delete()
    .eq('user_id', user.id).eq('organization_id', caller.organization_id)
    .eq('entity_type', entity_type).eq('entity_id', entity_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
