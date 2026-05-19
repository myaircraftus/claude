import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import ReviewQueueClient from './review-client'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { confidenceBand } from '@/lib/ocr/rescore'

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
          page_image_path,
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
          confidence_date,
          confidence_tach,
          confidence_mechanic,
          review_status
        )
      `)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      // B3 — worst-confidence-first. confidence_score is populated by
      // /api/admin/rescore-confidence; un-rescored rows (NULL) sort last and
      // keep their original created_at order.
      .order('confidence_score', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(50)
    queueItems = data ?? []
  } catch (err) {
    reviewLoadState = 'error'
    reviewLoadError = err instanceof Error ? err.message : 'Failed to load review queue'
  }

  // ── Load field candidates + conflicts for every item ──────────────────────
  // Batched: 4 queries total (was a per-item Promise.all loop — up to ~200
  // sequential round-trips for a 50-item queue). page_id / segment_id are
  // indexed, so the `.in(...)` lookups stay fast.
  const pageIds = Array.from(
    new Set(queueItems.map((it) => it.ocr_page_job?.id).filter((v): v is string => Boolean(v))),
  )
  const segmentIds = Array.from(
    new Set(
      queueItems
        .map((it) => it.ocr_entry_segment?.id ?? it.ocr_entry_segment_id)
        .filter((v): v is string => Boolean(v)),
    ),
  )

  function groupBy(rows: any[], key: string): Map<string, any[]> {
    const map = new Map<string, any[]>()
    for (const row of rows) {
      const k = row?.[key]
      if (!k) continue
      const bucket = map.get(k)
      if (bucket) bucket.push(row)
      else map.set(k, [row])
    }
    return map
  }

  let segCandidatesBySeg = new Map<string, any[]>()
  let segConflictsBySeg = new Map<string, any[]>()
  let pageCandidatesByPage = new Map<string, any[]>()
  let pageConflictsByPage = new Map<string, any[]>()
  try {
    const empty = Promise.resolve({ data: [] as any[] })
    const [segCand, segConf, pageCand, pageConf] = await Promise.all([
      segmentIds.length
        ? supabase.from('ocr_segment_field_candidates').select('*').in('segment_id', segmentIds)
        : empty,
      segmentIds.length
        ? supabase
            .from('segment_conflicts')
            .select('*')
            .in('segment_id', segmentIds)
            .eq('resolution_status', 'pending')
        : empty,
      pageIds.length
        ? supabase.from('extracted_field_candidates').select('*').in('page_id', pageIds)
        : empty,
      pageIds.length
        ? supabase
            .from('field_conflicts')
            .select('*')
            .in('page_id', pageIds)
            .eq('resolution_status', 'pending')
        : empty,
    ])
    segCandidatesBySeg = groupBy(segCand.data ?? [], 'segment_id')
    segConflictsBySeg = groupBy(segConf.data ?? [], 'segment_id')
    pageCandidatesByPage = groupBy(pageCand.data ?? [], 'page_id')
    pageConflictsByPage = groupBy(pageConf.data ?? [], 'page_id')
  } catch {}

  const enriched: any[] = queueItems.map((item) => {
    const pageId = item.ocr_page_job?.id
    const segmentId = item.ocr_entry_segment?.id ?? item.ocr_entry_segment_id ?? null
    if (!pageId) return item
    const fieldCandidates = [
      ...(segmentId ? (segCandidatesBySeg.get(segmentId) ?? []) : []),
      ...(pageCandidatesByPage.get(pageId) ?? []),
    ]
    const fieldConflicts = [
      ...(segmentId ? (segConflictsBySeg.get(segmentId) ?? []) : []),
      ...(pageConflictsByPage.get(pageId) ?? []),
    ]
    return { ...item, fieldCandidates, fieldConflicts }
  })

  // B3 — attach a CRITICAL / MEDIUM / LOW / AUTO priority band from the
  // rescored confidence so each queue card can show it. A NULL score (row not
  // yet rescored) yields no band.
  const enrichedWithBands = enriched.map((it) => ({
    ...it,
    priority_band:
      typeof it.confidence_score === 'number' ? confidenceBand(it.confidence_score) : null,
  }))

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
        items={enrichedWithBands}
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
