import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

    const { data: messages, error } = await supabase
      .from('thread_messages')
      .select('id, role, content, intent_type, artifact_type, artifact_data, created_at')
      .eq('thread_id', params.id)
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) throw error
    return NextResponse.json({ messages: messages ?? [] })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

    const body = await req.json()
    const allowed = ['title', 'is_pinned', 'is_archived', 'aircraft_id', 'thread_type']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data: thread, error } = await supabase
      .from('conversation_threads')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ thread })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()
    if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

    // Soft delete (archive)
    await supabase
      .from('conversation_threads')
      .update({ is_archived: true, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
