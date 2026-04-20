// PATCH /api/scanner/batches/[id]/pages/[pageId] — update classification / flags
// DELETE /api/scanner/batches/[id]/pages/[pageId] — remove a page (only while capturing)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

const VALID_CLASSIFICATIONS = new Set([
  'logbook_entry','work_order','estimate','annual_inspection','50hr_inspection','100hr_inspection',
  'ad_record','service_bulletin','yellow_tag','form_337','form_8130','squawk_discrepancy',
  'discrepancy_sheet','invoice','weight_balance','poh_afm_supplement','part_trace_conformity',
  'photo_evidence','stc_reference','informational','unknown',
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; pageId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (body.capture_classification !== undefined) {
    if (!VALID_CLASSIFICATIONS.has(body.capture_classification)) {
      return NextResponse.json({ error: 'Invalid classification' }, { status: 400 })
    }
    patch.capture_classification = body.capture_classification
  }
  if (body.user_marked_unreadable !== undefined) {
    patch.user_marked_unreadable = Boolean(body.user_marked_unreadable)
  }
  if (body.low_quality_override !== undefined) {
    patch.low_quality_override = Boolean(body.low_quality_override)
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('scan_pages')
    .update(patch)
    .eq('id', params.pageId)
    .eq('scan_batch_id', params.id)
    .select('id, page_number, capture_classification, user_marked_unreadable, low_quality_override')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: params.id,
    event_type: 'page_updated',
    payload: { page_id: params.pageId, patch },
    created_by: user.id,
  })

  return NextResponse.json({ page: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; pageId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Confirm batch is still in capturing state; block deletion after submit
  const { data: batch } = await supabase
    .from('scan_batches')
    .select('id, status, organization_id')
    .eq('id', params.id)
    .single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.status !== 'capturing') {
    return NextResponse.json({ error: 'Cannot delete pages after submission' }, { status: 400 })
  }

  // Load page to get storage path
  const { data: page } = await supabase
    .from('scan_pages')
    .select('id, page_number, original_image_path')
    .eq('id', params.pageId)
    .eq('scan_batch_id', params.id)
    .single()
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  // Best-effort storage delete (don't block on failure)
  if (page.original_image_path) {
    const cleaned = page.original_image_path.replace(/^scanner-captures\//, '')
    await supabase.storage.from('scanner-captures').remove([cleaned])
  }

  const { error: delErr } = await supabase
    .from('scan_pages')
    .delete()
    .eq('id', params.pageId)
    .eq('scan_batch_id', params.id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Recompute page_count
  const { count } = await supabase
    .from('scan_pages')
    .select('*', { count: 'exact', head: true })
    .eq('scan_batch_id', params.id)

  await (supabase as any)
    .from('scan_batches')
    .update({ page_count: count ?? 0 })
    .eq('id', params.id)

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: params.id,
    event_type: 'page_deleted',
    payload: { page_id: params.pageId, page_number: page.page_number },
    created_by: user.id,
  })

  return NextResponse.json({ ok: true })
}
