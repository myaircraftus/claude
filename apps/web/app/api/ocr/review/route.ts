import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  buildClassificationStorageFieldsBySelection,
  getDocumentClassificationProfileBySelection,
} from '@/lib/documents/classification'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import {
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'

type SegmentEvidenceState =
  | 'canonical_candidate'
  | 'informational_only'
  | 'non_canonical_evidence'
  | 'review_required'
  | 'ignore'

type ClassificationOverrides = {
  document_group_id?: string | null
  document_detail_id?: string | null
  document_subtype?: string | null
  truth_role?: string | null
  parser_strategy?: string | null
  evidence_state?: string | null
  reminder_relevance?: boolean | null
  ad_relevance?: boolean | null
  inspection_relevance?: boolean | null
}

function normalizeEvidenceState(raw: unknown): SegmentEvidenceState {
  switch (raw) {
    case 'informational_only':
    case 'non_canonical_evidence':
    case 'review_required':
    case 'ignore':
      return raw
    default:
      return 'canonical_candidate'
  }
}

function buildClassificationPatch(
  overrides: ClassificationOverrides | null | undefined,
  fallbackDocType: string
) {
  if (!overrides) return null

  const groupId = isDocumentGroupId(overrides.document_group_id)
    ? overrides.document_group_id
    : null
  const detailId = isDocumentDetailId(overrides.document_detail_id)
    ? overrides.document_detail_id
    : null

  if (!groupId || !detailId) {
    throw new Error('Invalid document classification selection')
  }

  const profile = getDocumentClassificationProfileBySelection(
    groupId,
    detailId,
    fallbackDocType as any
  )

  if (!profile) {
    throw new Error('Unable to resolve document classification profile')
  }

  const storageFields = buildClassificationStorageFieldsBySelection(
    groupId,
    detailId,
    fallbackDocType as any
  )

  if (!storageFields) {
    throw new Error('Unable to build classification storage fields')
  }

  const evidenceState = normalizeEvidenceState(overrides.evidence_state)

  return {
    ...storageFields,
    doc_type: profile.docType,
    document_group_id: profile.groupId,
    document_detail_id: profile.detailId,
    document_subtype:
      typeof overrides.document_subtype === 'string' && overrides.document_subtype.trim().length > 0
        ? overrides.document_subtype.trim()
        : null,
    truth_role:
      typeof overrides.truth_role === 'string' && overrides.truth_role.trim().length > 0
        ? overrides.truth_role.trim()
        : storageFields.truth_role,
    parser_strategy:
      typeof overrides.parser_strategy === 'string' && overrides.parser_strategy.trim().length > 0
        ? overrides.parser_strategy.trim()
        : storageFields.parser_strategy,
    reminder_relevance:
      typeof overrides.reminder_relevance === 'boolean'
        ? overrides.reminder_relevance
        : storageFields.reminder_relevance,
    ad_relevance:
      typeof overrides.ad_relevance === 'boolean'
        ? overrides.ad_relevance
        : storageFields.ad_relevance,
    inspection_relevance:
      typeof overrides.inspection_relevance === 'boolean'
        ? overrides.inspection_relevance
        : storageFields.inspection_relevance,
    evidence_state: evidenceState,
    canonical_candidate: evidenceState === 'canonical_candidate',
  }
}

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
      .select(`
        *,
        ocr_page_job:ocr_page_job_id(*),
        ocr_entry_segment:ocr_entry_segment_id(*),
        ocr_extracted_event:ocr_extracted_event_id(*)
      `)
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

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    id,
    action,
    corrected_fields,
    extracted_event_id,
    notes,
    classification_overrides,
    segment_id,
  } = body

  const statusMap: Record<string, string> = {
    approve: 'resolved',
    reject: 'resolved',
    unreadable: 'resolved',
    skip: 'skipped',
    reclassify: 'pending',
  }

  try {
    const { data: reviewItem } = await supabase
      .from('review_queue_items')
      .select(`
        id,
        organization_id,
        ocr_page_job_id,
        ocr_entry_segment_id,
        ocr_extracted_event_id,
        review_scope,
        segment_group_key,
        ocr_page_job:ocr_page_job_id(
          id,
          document:document_id(id, doc_type)
        )
      `)
      .eq('id', id)
      .eq('organization_id', membership.organization_id)
      .maybeSingle()

    if (!reviewItem) {
      return NextResponse.json({ error: 'Review item not found' }, { status: 404 })
    }

    const pageDocument = (reviewItem as any).ocr_page_job?.document
    const classificationPatch = buildClassificationPatch(
      classification_overrides,
      pageDocument?.doc_type ?? 'miscellaneous'
    )
    const effectiveEvidenceState =
      action === 'unreadable'
        ? 'ignore'
        : action === 'reject'
        ? 'review_required'
        : classificationPatch?.evidence_state ?? null

    const targetSegmentId =
      reviewItem.ocr_entry_segment_id ??
      segment_id ??
      null

    if (classificationPatch && targetSegmentId) {
      await supabase
        .from('ocr_entry_segments')
        .update({
          document_group_id: classificationPatch.document_group_id,
          document_detail_id: classificationPatch.document_detail_id,
          document_subtype: classificationPatch.document_subtype,
          record_family: classificationPatch.record_family,
          document_class: classificationPatch.document_class,
          truth_role: classificationPatch.truth_role,
          parser_strategy: classificationPatch.parser_strategy,
          review_priority: classificationPatch.review_priority,
          canonical_eligibility: classificationPatch.canonical_eligibility,
          reminder_relevance: classificationPatch.reminder_relevance,
          ad_relevance: classificationPatch.ad_relevance,
          inspection_relevance: classificationPatch.inspection_relevance,
          completeness_relevance: classificationPatch.completeness_relevance,
          intelligence_tags: classificationPatch.intelligence_tags,
          evidence_state: effectiveEvidenceState ?? classificationPatch.evidence_state,
          canonical_candidate:
            effectiveEvidenceState != null
              ? effectiveEvidenceState === 'canonical_candidate'
              : classificationPatch.canonical_candidate,
          reviewer_id: user.id,
          reviewed_at: new Date().toISOString(),
          ...(action === 'reject' || action === 'unreadable'
            ? {
                suppression_reason:
                  action === 'unreadable'
                    ? 'marked_unreadable_by_reviewer'
                    : 'rejected_by_reviewer',
              }
            : {}),
        })
        .eq('id', targetSegmentId)
    }

    if (classificationPatch && pageDocument?.id) {
      await supabase
        .from('documents')
        .update({
          doc_type: classificationPatch.doc_type,
          document_group_id: classificationPatch.document_group_id,
          document_detail_id: classificationPatch.document_detail_id,
          document_subtype: classificationPatch.document_subtype,
          record_family: classificationPatch.record_family,
          document_class: classificationPatch.document_class,
          truth_role: classificationPatch.truth_role,
          parser_strategy: classificationPatch.parser_strategy,
          review_priority: classificationPatch.review_priority,
          canonical_eligibility: classificationPatch.canonical_eligibility,
          reminder_relevance: classificationPatch.reminder_relevance,
          ad_relevance: classificationPatch.ad_relevance,
          inspection_relevance: classificationPatch.inspection_relevance,
          completeness_relevance: classificationPatch.completeness_relevance,
          intelligence_tags: classificationPatch.intelligence_tags,
        })
        .eq('id', pageDocument.id)
    }

    if (action !== 'reclassify') {
      await supabase.from('review_queue_items').update({
        status: statusMap[action] ?? 'resolved',
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: notes ?? action,
      }).eq('id', id)
    }

    if (reviewItem.ocr_page_job_id) {
      const pageJobPatch: Record<string, unknown> = {
        needs_human_review: action === 'reclassify',
      }

      if (action === 'reject' || action === 'unreadable') {
        pageJobPatch.arbitration_status = 'reject'
        pageJobPatch.review_reason = action === 'unreadable' ? 'Marked unreadable by reviewer' : 'Rejected by reviewer'
      } else if (action === 'skip') {
        pageJobPatch.review_reason = 'Skipped by reviewer'
      } else if (action === 'approve') {
        pageJobPatch.review_reason = 'Approved by reviewer'
      } else if (action === 'reclassify') {
        pageJobPatch.review_reason = 'Classification updated by reviewer'
      }

      await supabase
        .from('ocr_page_jobs')
        .update(pageJobPatch)
        .eq('id', reviewItem.ocr_page_job_id)
    }

    if (targetSegmentId && !classificationPatch) {
      const segmentPatch: Record<string, unknown> = {
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
      }

      if (action === 'reject' || action === 'unreadable') {
        segmentPatch.evidence_state = action === 'unreadable' ? 'ignore' : 'review_required'
        segmentPatch.suppression_reason = action === 'unreadable' ? 'marked_unreadable_by_reviewer' : 'rejected_by_reviewer'
      }

      await supabase
        .from('ocr_entry_segments')
        .update(segmentPatch)
        .eq('id', targetSegmentId)
    }

    if (targetSegmentId && action === 'approve') {
      const { data: segment } = await supabase
        .from('ocr_entry_segments')
        .select(
          'id, document_id, organization_id, aircraft_id, page_number, segment_index, text_content, evidence_state, canonical_candidate'
        )
        .eq('id', targetSegmentId)
        .single()

      if (segment && segment.canonical_candidate && segment.evidence_state === 'canonical_candidate') {
        const chunkIndex = Number(segment.page_number) * 1000 + Number(segment.segment_index)
        const chunkText = String(segment.text_content ?? '')

        const { data: canonicalChunk, error: chunkError } = await (supabase as any)
          .from('canonical_document_chunks')
          .upsert(
            {
              document_id: segment.document_id,
              organization_id: segment.organization_id,
              aircraft_id: segment.aircraft_id,
              page_number: segment.page_number,
              page_number_end: null,
              chunk_index: chunkIndex,
              section_title: null,
              chunk_text: chunkText,
              token_count: null,
              char_count: chunkText.length,
              parser_confidence: null,
              source_segment_id: segment.id,
              metadata_json: {
                source: 'ocr_segment',
                evidence_state: segment.evidence_state,
              },
            },
            { onConflict: 'document_id,chunk_index' }
          )
          .select('id')
          .single()

        if (!chunkError && canonicalChunk?.id && chunkText.trim().length > 0) {
          const [embedding] = await generateEmbeddings([
            { id: canonicalChunk.id, text: chunkText },
          ])
          if (embedding?.embedding) {
            await (supabase as any)
              .from('canonical_document_embeddings')
              .upsert(
                {
                  chunk_id: canonicalChunk.id,
                  document_id: segment.document_id,
                  organization_id: segment.organization_id,
                  aircraft_id: segment.aircraft_id,
                  embedding_model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
                  embedding: embedding.embedding,
                },
                { onConflict: 'chunk_id' }
              )
          }
        }
      }
    }

    const targetExtractedEventId = extracted_event_id ?? reviewItem.ocr_extracted_event_id
    if (action === 'approve' && targetExtractedEventId) {
      await supabase.from('ocr_extracted_events').update({
        review_status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        ...(corrected_fields ?? {}),
      }).eq('id', targetExtractedEventId)
    } else if (targetExtractedEventId && (action === 'reject' || action === 'unreadable')) {
      await supabase.from('ocr_extracted_events').update({
        review_status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', targetExtractedEventId)
    } else if (action === 'reclassify' && targetExtractedEventId) {
      await supabase.from('ocr_extracted_events').update({
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', targetExtractedEventId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update review queue item'
    const status = message.toLowerCase().includes('classification') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ success: true })
}
