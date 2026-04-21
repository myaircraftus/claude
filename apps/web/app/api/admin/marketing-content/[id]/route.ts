import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { CONTENT_TYPES } from '@/lib/marketing/content'

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, any> = {
    updated_by: guard.user!.id,
    updated_at: new Date().toISOString(),
  }
  if (body?.content_type !== undefined) {
    if (!CONTENT_TYPES.includes(body.content_type)) {
      return NextResponse.json(
        { error: `Unknown content_type "${body.content_type}"` },
        { status: 400 }
      )
    }
    updates.content_type = body.content_type
  }
  if (body?.value !== undefined) {
    updates.value = body.value == null ? null : String(body.value)
  }
  if (body?.metadata !== undefined) {
    updates.metadata = body.metadata ?? {}
  }

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('marketing_content')
    .update(updates)
    .eq('id', params.id)
    .select('id, page, slot, content_type, value, metadata, updated_at, updated_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  const service = createServiceSupabase()
  const { error } = await service.from('marketing_content').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
