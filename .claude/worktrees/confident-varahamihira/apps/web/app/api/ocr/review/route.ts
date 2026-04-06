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
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let items: any[] = []
  try {
    const { data } = await supabase
      .from('review_queue_items')
      .select('*, ocr_page_job:ocr_page_job_id(*), ocr_extracted_event:ocr_extracted_event_id(*)')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(30)
    items = data ?? []
  } catch {}

  return NextResponse.json({ items, count: items.length })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, action, corrected_fields, extracted_event_id, notes } = body

  const statusMap: Record<string, string> = {
    approve: 'resolved',
    reject: 'resolved',
    unreadable: 'resolved',
    skip: 'skipped',
  }

  try {
    await supabase.from('review_queue_items').update({
      status: statusMap[action] ?? 'resolved',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes ?? action,
    }).eq('id', id)

    if (action === 'approve' && extracted_event_id) {
      await supabase.from('ocr_extracted_events').update({
        review_status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        ...(corrected_fields ?? {}),
      }).eq('id', extracted_event_id)
    }
  } catch {}

  return NextResponse.json({ success: true })
}
