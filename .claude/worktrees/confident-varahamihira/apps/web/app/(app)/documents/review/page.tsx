import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import ReviewQueueClient from './review-client'
import type { UserProfile } from '@/types'

export const metadata = { title: 'OCR Review Queue' }

export default async function ReviewQueuePage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase.from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

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
          document:document_id(title, doc_type)
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
  } catch {}

  // ── For each item, load field candidates + conflicts ───────────────────────
  const enriched: any[] = []
  for (const item of queueItems) {
    const pageId = item.ocr_page_job?.id
    if (!pageId) { enriched.push(item); continue }

    let fieldCandidates: any[] = []
    let fieldConflicts: any[] = []

    try {
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
      />
    </div>
  )
}
