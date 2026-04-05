// POST /api/scanner/batches/[id]/pages — upload a captured page (image binary)
//
// Body: multipart/form-data with:
//   - file: Blob (image/jpeg or image/png)
//   - page_number: int (1-indexed)
//   - quality_score: number (0..1)
//   - warnings: comma-separated string
//   - user_marked_unreadable: '1' or '0'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load batch to get org + aircraft + validate access
  const { data: batch } = await supabase
    .from('scan_batches')
    .select('id, organization_id, aircraft_id, page_count, status')
    .eq('id', params.id)
    .single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.status !== 'capturing') {
    return NextResponse.json({ error: 'Batch is not accepting pages' }, { status: 400 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const pageNumberRaw = form.get('page_number')
  const qualityRaw = form.get('quality_score')
  const warningsRaw = form.get('warnings')
  const markedUnreadable = form.get('user_marked_unreadable') === '1'

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  const pageNumber = pageNumberRaw ? parseInt(String(pageNumberRaw), 10) : (batch.page_count + 1)
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: 'Invalid page_number' }, { status: 400 })
  }

  const qualityScore = qualityRaw ? Number(qualityRaw) : null
  const warnings = warningsRaw ? String(warningsRaw).split(',').map(s => s.trim()).filter(Boolean) : []

  const ext = (file.type === 'image/png') ? 'png' : 'jpg'
  const storagePath = `scanner-captures/${batch.organization_id}/${batch.id}/p${String(pageNumber).padStart(3, '0')}.${ext}`

  // Upload to Supabase Storage
  const buf = Buffer.from(await file.arrayBuffer())
  const { error: uploadErr } = await supabase.storage
    .from('scanner-captures')
    .upload(storagePath.replace(/^scanner-captures\//, ''), buf, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    })
  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  // Insert page row
  const { data: pageRow, error: insertErr } = await (supabase as any)
    .from('scan_pages')
    .insert({
      scan_batch_id: batch.id,
      organization_id: batch.organization_id,
      aircraft_id: batch.aircraft_id,
      page_number: pageNumber,
      original_image_path: storagePath,
      processed_capture_image_path: storagePath,
      capture_quality_score: qualityScore,
      capture_warnings: warnings,
      user_marked_unreadable: markedUnreadable,
      upload_status: 'uploaded',
      processing_status: 'queued',
    })
    .select('id, page_number, capture_quality_score, capture_warnings')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Bump page_count
  await (supabase as any)
    .from('scan_batches')
    .update({ page_count: Math.max(batch.page_count, pageNumber) })
    .eq('id', batch.id)

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: batch.id,
    event_type: 'page_added',
    payload: { page_number: pageNumber, quality_score: qualityScore, warnings },
    created_by: user.id,
  })

  return NextResponse.json({ page: pageRow }, { status: 201 })
}
