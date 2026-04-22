import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import ReviewQueueClient from './review-client'
import { requireAppServerSession } from '@/lib/auth/server-app'

export const metadata = { title: 'OCR Review Queue' }

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams?: { documentId?: string }
}) {
  const { supabase, profile, membership } = await requireAppServerSession()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const focusDocumentId = typeof searchParams?.documentId === 'string' ? searchParams.documentId : null
  let focusDocumentTitle: string | null = null
  let reviewLoadState: 'loaded' | 'error' = 'loaded'
  let reviewLoadError: string | null = null

  if (focusDocumentId) {
    try {
      const { data } = await supabase
        .from('documents')
        .select('title')
        .eq('id', focusDocumentId)
        .eq('organization_id', orgId)
        .single()

      focusDocumentTitle = data?.title ?? null
    } catch {}
  }

  // ── Queue items with full arbitration data ─────────────────────────────────
  let queueItems: any[] = []
  try {
    const { data } = await supabase
      .from('review_queue_items')
      .select(`
        *,
        ocr_page_job:ocr_page_job_id(
          id,
          page_number,
          page_classification,
          ocr_confidence,
          ocr_raw_text,
          arbitration_status,
          arbitration_confidence,
          arbitration_reasoning,
          engines_run,
          document:document_id(
            id,
            title,
            doc_type,
            document_group_id,
            document_detail_id,
            document_subtype,
            record_family,
            truth_role,
            parser_strategy,
            review_priority,
            canonical_eligibility,
            reminder_relevance,
            ad_relevance,
            inspection_relevance,
            completeness_relevance,
            intelligence_tags
          )
        ),
        ocr_entry_segment:ocr_entry_segment_id(
          id,
          segment_type,
          evidence_state,
          confidence,
          text_content,
          excerpt_text,
          normalized_text,
          source_engine,
          segment_group_key,
          cross_page_continuation,
          bounding_regions,
          metadata_json,
          document_group_id,
          document_detail_id,
          document_subtype,
          record_family,
          document_class,
          truth_role,
          parser_strategy,
          review_priority,
          canonical_eligibility,
          reminder_relevance,
          ad_relevance,
          inspection_relevance,
          completeness_relevance,
          intelligence_tags
        ),
        ocr_extracted_event:ocr_extracted_event_id(
          id,
          event_type,
          event_date,
          tach_time,
          airframe_tt,
          work_description,
          mechanic_name,
          mechanic_cert_number,
          ia_number,
          ad_references,
          part_numbers,
          confidence_overall,
          review_status
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50)
    queueItems = data ?? []
  } catch (err) {
    reviewLoadState = 'error'
    reviewLoadError = err instanceof Error ? err.message : 'Failed to load review queue'
  }

  // ── For each item, load field candidates + conflicts ───────────────────────
  const enriched: any[] = []
  for (const item of queueItems) {
    const pageId = item.ocr_page_job?.id
    const segmentId = item.ocr_entry_segment?.id ?? item.ocr_entry_segment_id ?? null
    if (!pageId) { enriched.push(item); continue }

    let fieldCandidates: any[] = []
    let fieldConflicts: any[] = []

    try {
      if (segmentId) {
        const [segmentCandidatesRes, segmentConflictsRes, legacyCandidatesRes, legacyConflictsRes] = await Promise.all([
          supabase
            .from('ocr_segment_field_candidates')
            .select('*')
            .eq('segment_id', segmentId),
          supabase
            .from('segment_conflicts')
            .select('*')
            .eq('segment_id', segmentId)
            .eq('resolution_status', 'pending'),
          supabase
            .from('extracted_field_candidates')
            .select('*')
            .eq('page_id', pageId),
          supabase
            .from('field_conflicts')
            .select('*')
            .eq('page_id', pageId)
            .eq('resolution_status', 'pending'),
        ])

        fieldCandidates = [
          ...(segmentCandidatesRes.data ?? []),
          ...(legacyCandidatesRes.data ?? []),
        ]
        fieldConflicts = [
          ...(segmentConflictsRes.data ?? []),
          ...(legacyConflictsRes.data ?? []),
        ]
      } else {
        const [candidatesRes, conflictsRes] = await Promise.all([
          supabase
            .from('extracted_field_candidates')
            .select('*')
            .eq('page_id', pageId),
          supabase
            .from('field_conflicts')
            .select('*')
            .eq('page_id', pageId)
            .eq('resolution_status', 'pending'),
        ])
        fieldCandidates = candidatesRes.data ?? []
        fieldConflicts = conflictsRes.data ?? []
      }
    } catch {}

    enriched.push({ ...item, fieldCandidates, fieldConflicts })
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  let totalNeedsReview = 0
  try {
    const { count } = await supabase
      .from('ocr_page_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('needs_human_review', true)
    totalNeedsReview = count ?? 0
  } catch {}

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Documents', href: '/documents' },
          { label: 'Review Queue' },
        ]}
      />
      <ReviewQueueClient
        items={enriched}
        orgId={orgId}
        totalNeedsReview={totalNeedsReview}
        loadState={reviewLoadState}
        loadError={reviewLoadError}
        focusDocumentId={focusDocumentId}
        focusDocumentTitle={focusDocumentTitle}
      />
    </div>
  )
}
