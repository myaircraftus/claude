// GET /api/scanner/batches — list org's recent batches
// POST /api/scanner/batches — create a new batch (status=capturing)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { BatchType, BatchSourceMode } from '@/lib/scanner/types'
import { buildClassificationStorageFieldsBySelection } from '@/lib/documents/classification'
import { isDocumentDetailId, isDocumentGroupId } from '@/lib/documents/taxonomy'
import { ensureBookRecord } from '@/lib/documents/books'

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
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)
  const status = searchParams.get('status')

  let query = supabase
    .from('scan_batches')
    .select(`
      id, title, batch_type, source_mode, document_group_id, document_detail_id, document_subtype, status, page_count, submitted_at,
      created_at, updated_at, aircraft_id,
      aircraft:aircraft_id (id, tail_number)
    `)
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ batches: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const body = await req.json()
  const batchType: BatchType = (body.batch_type ?? 'unknown') as BatchType
  const sourceMode: BatchSourceMode = (body.source_mode ?? 'batch') as BatchSourceMode
  const bookNumber = typeof body.book_number === 'string' ? body.book_number.trim() : null
  const bookType = typeof body.book_type === 'string' ? body.book_type.trim() : null
  const bookAssignment =
    body.book_assignment === 'present'
      ? 'present'
      : body.book_assignment === 'historical'
        ? 'historical'
        : null
  const documentGroupId = isDocumentGroupId(body.document_group_id) ? body.document_group_id : null
  const documentDetailId = isDocumentDetailId(body.document_detail_id) ? body.document_detail_id : null
  const documentSubtype =
    typeof body.document_subtype === 'string' && body.document_subtype.trim().length > 0
      ? body.document_subtype.trim()
      : null
  const classificationFields = buildClassificationStorageFieldsBySelection(
    documentGroupId,
    documentDetailId
  )

  const bookId = await ensureBookRecord(supabase, {
    organizationId: membership.organization_id,
    aircraftId: body.aircraft_id ?? null,
    bookType,
    bookNumber,
    bookAssignment,
    title: bookNumber ? `Logbook ${bookNumber}` : null,
    createdBy: user.id,
  })

  const { data: batch, error } = await (supabase as any)
    .from('scan_batches')
    .insert({
      organization_id: membership.organization_id,
      aircraft_id: body.aircraft_id ?? null,
      scanner_user_id: user.id,
      batch_type: batchType,
      source_mode: sourceMode,
      document_group_id: documentGroupId,
      document_detail_id: documentDetailId,
      document_subtype: documentSubtype,
      ...(classificationFields ?? {}),
      book_id: bookId,
      book_number: bookNumber,
      book_type: bookType,
      book_assignment: bookAssignment,
      title: body.title ?? null,
      notes: body.notes ?? null,
      status: 'capturing',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: batch.id,
    event_type: 'created',
    payload: { batch_type: batchType, source_mode: sourceMode },
    created_by: user.id,
  })

  return NextResponse.json(batch, { status: 201 })
}
