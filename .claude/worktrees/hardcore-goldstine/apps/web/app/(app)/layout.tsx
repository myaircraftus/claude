import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Sidebar } from '@/components/shared/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get user profile + membership
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  // No org yet → onboarding
  if (!membership) redirect('/onboarding')

  const organization = (membership as any).organizations
  const orgId = membership.organization_id

  // Get aircraft for sidebar
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch badge counts for sidebar (gracefully handle missing tables)
  let reminderCount = 0
  let reviewQueueCount = 0

  try {
    const { count } = await supabase
      .from('reminders')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .in('status', ['active'])
      .not('due_date', 'is', null)
    reminderCount = count ?? 0
  } catch {
    // Table may not exist yet
  }

  try {
    const { count } = await supabase
      .from('ocr_page_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('needs_human_review', true)
      .eq('extraction_status', 'needs_review')
    reviewQueueCount = count ?? 0
  } catch {
    // Table may not exist yet
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fb' }}>
      <Sidebar
        organization={organization}
        aircraft={(aircraft ?? []) as any}
        reminderCount={reminderCount}
        reviewQueueCount={reviewQueueCount}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {children}
      </div>
    </div>
  )
}
