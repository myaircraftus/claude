import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  try {
    let query = supabase
      .from('maintenance_entry_drafts')
      .select('*, aircraft:aircraft_id(tail_number, make, model)')
      .eq('organization_id', membership.organization_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (aircraftId) {
      query = query.eq('aircraft_id', aircraftId)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ drafts: [] })
    return NextResponse.json({ drafts: data ?? [] })
  } catch {
    // Table may not exist yet
    return NextResponse.json({ drafts: [] })
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    id: string
    edited_text?: string
    structured_fields?: Record<string, unknown>
    status?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { id, edited_text, structured_fields, status } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Verify org membership before allowing update
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (edited_text !== undefined) updatePayload.edited_text = edited_text
    if (structured_fields !== undefined) updatePayload.structured_fields = structured_fields
    if (status !== undefined) updatePayload.status = status

    const { data, error } = await supabase
      .from('maintenance_entry_drafts')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ draft: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
