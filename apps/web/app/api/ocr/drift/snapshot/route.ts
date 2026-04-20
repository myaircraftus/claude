import { NextRequest, NextResponse } from 'next/server'
import { recordDocumentDriftSnapshot } from '@/lib/intelligence/quality'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const service = createServiceSupabase()

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
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const documentId = body?.document_id as string | undefined

  if (!documentId) {
    return NextResponse.json({ error: 'document_id required' }, { status: 400 })
  }

  const { data: document } = await service
    .from('documents')
    .select('id, organization_id, doc_type, record_family, document_group_id, document_detail_id')
    .eq('id', documentId)
    .maybeSingle()

  if (!document || document.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: pages } = await service
    .from('ocr_page_jobs')
    .select('id, page_number, page_classification, ocr_confidence, ocr_engine')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })

  const { data: segments } = await service
    .from('ocr_entry_segments')
    .select('segment_type, evidence_state, canonical_candidate')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true })
    .order('segment_index', { ascending: true })

  const pageIds = (pages ?? []).map((page: any) => page.id).filter(Boolean)

  const [{ count: pageConflicts }, { count: segmentConflicts }] = await Promise.all([
    pageIds.length > 0
      ? service
          .from('field_conflicts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', membership.organization_id)
          .eq('resolution_status', 'pending')
          .in('page_id', pageIds)
      : Promise.resolve({ count: 0 }),
    service
      .from('segment_conflicts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', membership.organization_id)
      .eq('resolution_status', 'pending')
      .eq('document_id', documentId),
  ])

  await recordDocumentDriftSnapshot({
    supabase: service,
    organizationId: membership.organization_id,
    documentId,
    documentFamily:
      document.record_family ??
      document.document_group_id ??
      document.document_detail_id ??
      document.doc_type ??
      'unknown',
    providerName: 'manual_snapshot',
    pages: (pages ?? []).map((page: any) => ({
      page_number: page.page_number,
      page_classification: page.page_classification,
      ocr_confidence: page.ocr_confidence,
      ocr_engine: page.ocr_engine,
    })),
    segments: (segments ?? []).map((segment: any) => ({
      segmentType: segment.segment_type,
      evidenceState: segment.evidence_state,
      canonicalCandidate: Boolean(segment.canonical_candidate),
    })),
    conflictCount: (pageConflicts ?? 0) + (segmentConflicts ?? 0),
  })

  return NextResponse.json({
    success: true,
    document_id: documentId,
    page_count: pages?.length ?? 0,
    segment_count: segments?.length ?? 0,
    conflict_count: (pageConflicts ?? 0) + (segmentConflicts ?? 0),
  })
}
