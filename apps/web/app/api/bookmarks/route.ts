/**
 * /api/bookmarks  (Spec 6.6)
 *
 *   GET  → caller's bookmarks for the active org, ordered by position
 *   POST → upsert by (user_id, organization_id, entity_type, entity_id)
 *   DELETE ?entity_type=&entity_id= → remove the matching star
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { parseJsonBody, safeUrl } from '@/lib/validation/common'

export const dynamic = 'force-dynamic'

// Spec 5.4 — runtime body validation. Field caps mirror the slice
// values applied in the upsert below (entity_type:64, entity_id:128,
// label:200, url:500); the schema enforces them at parse time so
// oversized inputs are rejected with 400 before hitting Postgres.
const PostBody = z.object({
  entity_type: z.string().min(1).max(64),
  entity_id: z.string().min(1).max(128),
  label: z.string().min(1).max(200),
  url: safeUrl.max(500),
  position: z.number().int().optional(),
})

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

  const parsed = await parseJsonBody(req, PostBody)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const { data, error } = await supabase
    .from('bookmarks')
    .upsert({
      user_id: user.id,
      organization_id: caller.organization_id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      label: body.label,
      url: body.url,
      position: body.position ?? 0,
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
