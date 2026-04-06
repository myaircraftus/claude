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

  let queueItems: any[] = []
  try {
    const { data } = await supabase
      .from('review_queue_items')
      .select(`
        *,
        ocr_page_job:ocr_page_job_id(
          page_number, page_classification, ocr_confidence, ocr_raw_text,
          document:document_id(title)
        ),
        ocr_extracted_event:ocr_extracted_event_id(
          event_type, event_date, tach_time, work_description,
          mechanic_name, mechanic_cert_number, ad_references,
          confidence_overall, review_status
        )
      `)
      .eq('organization_id', membership.organization_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(30)
    queueItems = data ?? []
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
      <ReviewQueueClient items={queueItems} orgId={membership.organization_id} />
    </div>
  )
}
