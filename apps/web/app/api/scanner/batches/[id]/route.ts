// GET  /api/scanner/batches/[id] — batch + pages
// PATCH /api/scanner/batches/[id] — update title / classification / status

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: batch } = await supabase
    .from('scan_batches')
    .select(`
      id, title, notes, batch_type, source_mode, status, page_count,
      submitted_at, completed_at, created_at, updated_at, aircraft_id, batch_pdf_path,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('id', params.id)
    .single()
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: pages } = await supabase
    .from('scan_pages')
    .select('id, page_number, original_image_path, processed_capture_image_path, capture_quality_score, capture_warnings, capture_classification, user_marked_unreadable, low_quality_override, upload_status, processing_status, created_at')
    .eq('scan_batch_id', params.id)
    .order('page_number', { ascending: true })

  const { data: events } = await supabase
    .from('scan_batch_events')
    .select('id, event_type, payload, created_at')
    .eq('scan_batch_id', params.id)
    .order('created_at', { ascending: false })
    .limit(40)

  return NextResponse.json({ batch, pages: pages ?? [], events: events ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.notes !== undefined) patch.notes = body.notes
  if (body.batch_type) patch.batch_type = body.batch_type
  if (body.aircraft_id !== undefined) patch.aircraft_id = body.aircraft_id
  if (body.status) patch.status = body.status

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

  const { error } = await (supabase as any)
    .from('scan_batches')
    .update(patch)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: params.id,
    event_type: 'updated',
    payload: patch,
    created_by: user.id,
  })

  return NextResponse.json({ ok: true })
}
