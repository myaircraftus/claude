import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
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

    const url = new URL(req.url)
    const aircraftId = url.searchParams.get('aircraft_id')
    const limit = parseInt(url.searchParams.get('limit') ?? '50')

    let query = supabase
      .from('conversation_threads')
      .select(`
        id, title, thread_type, aircraft_id, customer_id,
        is_pinned, is_archived, last_message_at, message_count,
        created_at, updated_at,
        aircraft:aircraft_id (tail_number, make, model)
      `)
      .eq('organization_id', membership.organization_id)
      .eq('is_archived', false)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false })
      .limit(limit)

    if (aircraftId) {
      query = query.eq('aircraft_id', aircraftId)
    }

    const { data: threads, error } = await query
    if (error) throw error

    return NextResponse.json({ threads: threads ?? [] })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
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
    const { title, thread_type = 'general', aircraft_id, customer_id } = body

    const { data: thread, error } = await supabase
      .from('conversation_threads')
      .insert({
        organization_id: membership.organization_id,
        created_by: user.id,
        title: title ?? null,
        thread_type,
        aircraft_id: aircraft_id ?? null,
        customer_id: customer_id ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ thread })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
