// POST /api/scanner/batches/[id]/submit — finalize a batch and queue for processing
//
// Sets status=submitted, submitted_at=now. Downstream OCR pipeline picks this up.

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { PDFDocument } from 'pdf-lib'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { queueDocumentIngestion } from '@/lib/ingestion/server'
import { shouldPreferBackgroundIngestion } from '@/lib/ingestion/background-policy'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import { deriveDocTypeFromClassification, isDocumentDetailId, isDocumentGroupId } from '@/lib/documents/taxonomy'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const serviceSupabase = createServiceSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: batch } = await supabase
    .from('scan_batches')
    .select(
      'id, organization_id, aircraft_id, page_count, status, title, document_group_id, document_detail_id, document_subtype, book_id, book_number, book_type, book_assignment'
    )
    .eq('id', params.id)
    .single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.page_count < 1) {
    return NextResponse.json({ error: 'Batch has no pages' }, { status: 400 })
  }
  if (batch.status !== 'capturing') {
    return NextResponse.json({ error: 'Batch already submitted' }, { status: 400 })
  }

  const { data: pages, error: pagesError } = await supabase
    .from('scan_pages')
    .select('id, page_number, original_image_path, processed_capture_image_path')
    .eq('scan_batch_id', batch.id)
    .order('page_number', { ascending: true })

  if (pagesError || !pages || pages.length === 0) {
    return NextResponse.json({ error: 'Batch pages not found' }, { status: 404 })
  }

  const pdfDoc = await PDFDocument.create()

  for (const page of pages as Array<{
    page_number: number
    original_image_path?: string | null
    processed_capture_image_path?: string | null
  }>) {
    const sourcePath = page.processed_capture_image_path ?? page.original_image_path
    if (!sourcePath) continue
    const cleaned = sourcePath.replace(/^scanner-captures\//, '')
    const { data: blob, error: downloadError } = await serviceSupabase.storage
      .from('scanner-captures')
      .download(cleaned)
    if (downloadError || !blob) {
      return NextResponse.json({ error: `Failed to download scanned page ${page.page_number}` }, { status: 500 })
    }
    const bytes = Buffer.from(await blob.arrayBuffer())
    const ext = cleaned.split('.').pop()?.toLowerCase()
    const image =
      ext === 'png'
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes)
    const pageSize = { width: image.width, height: image.height }
    const pdfPage = pdfDoc.addPage([pageSize.width, pageSize.height])
    pdfPage.drawImage(image, { x: 0, y: 0, width: pageSize.width, height: pageSize.height })
  }

  const pdfBytes = await pdfDoc.save()
  const docId = randomUUID()
  const fileName = `scan-batch-${batch.id}.pdf`
  const storagePath = `${batch.organization_id}/${batch.aircraft_id ?? 'general'}/originals/${docId}/${fileName}`
  const checksum = createHash('sha256').update(pdfBytes).digest('hex')

  const { error: uploadError } = await serviceSupabase.storage
    .from('documents')
    .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Failed to upload batch PDF: ${uploadError.message}` }, { status: 500 })
  }

  const documentGroupId = isDocumentGroupId(batch.document_group_id) ? batch.document_group_id : null
  const documentDetailId = isDocumentDetailId(batch.document_detail_id) ? batch.document_detail_id : null
  const docType = deriveDocTypeFromClassification(documentDetailId, 'logbook')
  const classificationFields = buildClassificationStorageFieldsBySelection(documentGroupId, documentDetailId, docType)

  const { data: docRecord, error: insertError } = await (serviceSupabase as any)
    .from('documents')
    .insert({
      id: docId,
      organization_id: batch.organization_id,
      aircraft_id: batch.aircraft_id ?? null,
      title: batch.title ?? `Scan batch ${batch.id}`,
      doc_type: docType,
      document_group_id: documentGroupId,
      document_detail_id: documentDetailId,
      document_subtype: batch.document_subtype ?? null,
      ...(classificationFields ?? {}),
      description: batch.title ?? null,
      file_path: storagePath,
      file_name: fileName,
      file_size_bytes: pdfBytes.length,
      mime_type: 'application/pdf',
      checksum_sha256: checksum,
      parsing_status: 'queued',
      source_provider: 'direct_upload',
      ocr_required: true,
      version_number: 1,
      uploaded_by: user.id,
      uploader_role: 'scanner',
      uploader_name: 'Scanner',
      visibility: 'team',
      book_id: batch.book_id ?? null,
      book_number: batch.book_number ?? null,
      book_type: batch.book_type ?? null,
      book_assignment: batch.book_assignment ?? null,
      scan_batch_id: batch.id,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !docRecord) {
    await serviceSupabase.storage.from('documents').remove([storagePath])
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create document' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error } = await (supabase as any)
    .from('scan_batches')
    .update({ status: 'submitted', submitted_at: now, document_id: docId, batch_pdf_path: storagePath })
    .eq('id', batch.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: batch.id,
    event_type: 'submitted',
    payload: { page_count: batch.page_count, submitted_at: now, document_id: docId },
    created_by: user.id,
  })

  const requiresBackgroundProcessing = shouldPreferBackgroundIngestion({
    fileSizeBytes: pdfBytes.length,
    docType,
  })

  await queueDocumentIngestion(docId, {
    preferBackground: requiresBackgroundProcessing,
    allowInlineFallback: true,
  })

  return NextResponse.json({ ok: true, status: 'submitted', submitted_at: now, document_id: docId })
}
